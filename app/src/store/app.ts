import { create } from 'zustand'
import { notesAPI, errorText } from '@/hooks/api.hooks'
import { getDescendantIds } from '@/helpers/hierarchy'
import type {
    PrivacyState,
    Note,
    NoteChanges,
    Tag,
    Snapshot,
    SyncStatus,
    MarkdownExport,
    MarkdownImport,
} from '@/types'
import type { TagSaveJob } from '@/helpers/tag-autosave'
import {
    bodyText,
    documentTagPaths,
    escapeHtml,
    formatHashtag,
    hashtagPath,
    pathKey,
    renamedPaths,
    renameDocumentHashtags,
} from '@/helpers/hashtags'
import { countChecklist } from '@/helpers/checklist'
import type { ScheduledTask, TaskSchedule } from '@/helpers/task-schedule'
import { documentImages } from '@/helpers/note-files'
import { isNoteSort, readNoteSort, type NoteSort } from '@/helpers/note-sort'
import { clampReadingFontSize, readReadingFontSize } from '@/helpers/reading-font-size'

type Checklist = ReturnType<typeof countChecklist>

const pending = new Map<string, NoteChanges & Partial<Checklist> & { images?: string[] }>()
const pendingTags = new Set<TagSaveJob>()
const pendingImports = new Set<Promise<void>>()
let timer: ReturnType<typeof setTimeout>
let saving: Promise<void> | null = null
let syncing: Promise<void> | null = null

type AppState = {
    privacy: PrivacyState
    locking: boolean
    unlockOpen: boolean
    encryptionAfterUnlock: { id: string; encrypted: boolean } | null
    sync: SyncStatus | null
    syncing: boolean
    notes: (Note & Checklist)[]
    tags: Tag[]
    selectedId: string
    selectedIds: string[]
    selectionAnchorId: string
    draggedNoteIds: string[]
    filter: string
    search: string
    loading: boolean
    status: 'saved' | 'saving' | 'error'
    error: string
    focusMode: boolean
    noteSort: NoteSort
    readingFontSize: number
    actions: {
        setPin(pin: string): Promise<void>
        clearPin(pin: string): Promise<void>
        unlock(pin: string): Promise<void>
        lock(): Promise<void>
        requestUnlock(change?: { id: string; encrypted: boolean }): void
        dismissUnlock(): void
        setNoteEncrypted(id: string, encrypted: boolean): Promise<void>
        refresh(): Promise<void>
        sync(): Promise<void>
        chooseSyncFolder(): Promise<void>
        disconnectSync(): Promise<void>
        exportMarkdown(): Promise<MarkdownExport | null>
        importMarkdown(): Promise<Omit<MarkdownImport, 'snapshot'> | null>
        select(id: string, options?: { toggle?: boolean; range?: boolean; visibleIds?: string[] }): void
        reconcileSelection(visibleIds: string[]): void
        setDraggedNotes(ids: string[]): void
        dropNotes(targetId: string): void
        setFilter(filter: string): void
        setSearch(search: string): void
        setNoteSort(sort: NoteSort): void
        setReadingFontSize(size: number): void
        setError(error: unknown): void
        toggleFocus(): void
        createNote(): Promise<void>
        importFile(data: Uint8Array, noteId: string, attachmentName?: string): Promise<string>
        queueFileImport(importing: Promise<void>): void
        rescheduleTask(noteId: string, body: string, task: ScheduledTask, schedule: TaskSchedule): void
        updateNote(id: string, changes: NoteChanges): void
        addNoteTag(noteId: string, tagId: string): void
        flush(): Promise<void>
        queueTagSave(save: TagSaveJob, delay?: number): void
        cancelTagSave(save: TagSaveJob): void
        saveTag(tag: Partial<Tag> & { text: string }): Promise<Tag>
        deleteTag(id: string): Promise<void>
        deleteNote(id: string): Promise<void>
    }
}

export const useAppStore = create<AppState>((set, get) => {
    const hydrateNotes = (notes: Note[]) => {
        const current = new Map(get().notes.map((note) => [note.id, note]))
        return notes.map((note) => {
            if (!note.images) note = { ...note, images: documentImages(note.body) }

            const previous = current.get(note.id)
            const cached = previous?.body === note.body ? previous : null
            if (Number.isInteger(note.checklistTotal) && Number.isInteger(note.checklistChecked)) {
                const scheduledTasks =
                    cached?.scheduledTasks ??
                    (/data-(?:due-date|schedule)/i.test(note.body) ? countChecklist(note.body).scheduledTasks : [])

                return { ...note, scheduledTasks }
            }

            // A desktop process opened before the schema update can still return old-shaped notes.
            const { checklistTotal, checklistChecked, scheduledTasks } = cached ?? countChecklist(note.body)
            return { ...note, checklistTotal, checklistChecked, scheduledTasks }
        })
    }

    const applySnapshot = (snapshot: Snapshot, before?: Tag[]) => {
        if (before) {
            const paths = renamedPaths(before, snapshot.tags)
            for (const [id, changes] of pending) {
                const note = get().notes.find((note) => note.id === id)
                if (note) pending.set(id, { ...changes, ...renameDocumentHashtags(note, paths) })
            }
        }
        const ids = new Set(snapshot.notes.map((note) => note.id))
        const unsaved = get().notes.filter((note) => pending.has(note.id) && !ids.has(note.id))
        const notes = [...hydrateNotes(snapshot.notes), ...unsaved].map((note) => ({
            ...note,
            ...pending.get(note.id),
        }))

        set({
            privacy: snapshot.privacy,
            tags: snapshot.tags,
            notes,
            selectedId: notes.some((note) => note.id === get().selectedId) ? get().selectedId : '',
            selectedIds: get().selectedIds.filter((id) => ids.has(id)),
            filter:
                ['all', 'pinned', 'upcoming', 'untagged', 'trash'].includes(get().filter) ||
                snapshot.tags.some((tag) => tag.id === get().filter)
                    ? get().filter
                    : 'all',
        })
    }

    const syncSnapshot = async (before?: Tag[]) => applySnapshot(await notesAPI().snapshot(), before)

    const persistTag = async (tag: Partial<Tag> & { text: string }) => {
        const before = get().tags
        const saved = await notesAPI().saveTag(tag)
        await syncSnapshot(before)
        return saved
    }

    return {
        privacy: { pinSet: false, unlocked: false },
        locking: false,
        unlockOpen: false,
        encryptionAfterUnlock: null,
        sync: null,
        syncing: false,
        notes: [],
        tags: [],
        selectedId: '',
        selectedIds: [],
        selectionAnchorId: '',
        draggedNoteIds: [],
        filter: 'all',
        search: '',
        loading: true,
        status: 'saved',
        error: '',
        focusMode: false,
        noteSort: readNoteSort(),
        readingFontSize: readReadingFontSize(),
        actions: {
            setPin: async (pin) => {
                await get().actions.flush()
                applySnapshot(await notesAPI().setPin(pin))
            },
            clearPin: async (pin) => {
                if (syncing) await syncing
                await get().actions.flush()
                applySnapshot(await notesAPI().clearPin(pin))
            },
            requestUnlock: (change) => set({ unlockOpen: true, encryptionAfterUnlock: change || null }),
            dismissUnlock: () => set({ unlockOpen: false, encryptionAfterUnlock: null }),
            unlock: async (pin) => {
                await get().actions.flush()
                applySnapshot(await notesAPI().unlock(pin))
                const change = get().encryptionAfterUnlock
                if (change) await get().actions.setNoteEncrypted(change.id, change.encrypted)

                set({ unlockOpen: false, encryptionAfterUnlock: null })
                await get().actions.sync()
            },
            lock: async () => {
                if (get().locking) return
                set({ locking: true, unlockOpen: false, encryptionAfterUnlock: null, search: '', draggedNoteIds: [] })

                try {
                    await notesAPI().prepareLock()
                    await get().actions.flush()
                    applySnapshot(await notesAPI().lock())
                    set({ locking: false })
                } catch (error) {
                    // Keep the editor covered and pending edits available for retry.
                    get().actions.setError(error)
                    set({ locking: false, privacy: { ...get().privacy, unlocked: false } })
                    throw error
                }
            },
            setNoteEncrypted: async (id, encrypted) => {
                if (syncing) await syncing
                if (!get().privacy.unlocked) {
                    get().actions.requestUnlock({ id, encrypted })
                    return
                }
                await get().actions.flush()
                applySnapshot(await notesAPI().setNoteEncrypted(id, encrypted))
            },
            refresh: async () => {
                try {
                    const [snapshot, sync] = await Promise.all([
                        notesAPI().snapshot(),
                        notesAPI().syncStatus?.() || Promise.resolve(null),
                    ])
                    applySnapshot(snapshot)
                    set({ sync, loading: false })
                    await get().actions.sync()
                } catch (error) {
                    set({ error: errorText(error), loading: false })
                }
            },
            sync: async () => {
                if (!window.blot?.syncNow) return
                if (syncing) return syncing

                syncing = (async () => {
                    set({ syncing: true })
                    try {
                        await get().actions.flush()
                        const result = await notesAPI().syncNow()
                        if (result.snapshot) applySnapshot(result.snapshot)
                        set({ sync: result.status })
                    } catch (error) {
                        set({
                            sync: { folder: null, lastSync: null, waiting: 0, ...get().sync, error: errorText(error) },
                        })
                    } finally {
                        set({ syncing: false })
                    }
                })()
                try {
                    await syncing
                } finally {
                    syncing = null
                }
            },
            chooseSyncFolder: async () => {
                if (!window.blot?.chooseSyncFolder) throw new Error('Restart Blot to enable folder sync.')

                await get().actions.flush()
                const sync = await notesAPI().chooseSyncFolder()
                set({ sync })
                await get().actions.sync()
            },
            disconnectSync: async () => {
                if (syncing) await syncing
                set({ sync: await notesAPI().disconnectSync() })
            },
            exportMarkdown: async () => {
                if (!window.blot?.exportMarkdown) throw new Error('Restart Blot to enable Markdown export.')

                await get().actions.flush()

                return notesAPI().exportMarkdown()
            },
            importMarkdown: async () => {
                if (!window.blot?.importMarkdown) throw new Error('Restart Blot to enable Markdown import.')

                await get().actions.flush()
                const result = await notesAPI().importMarkdown()
                if (!result) return null

                applySnapshot(result.snapshot)

                return { count: result.count, missingImages: result.missingImages || [] }
            },
            select: (id, { toggle = false, range = false, visibleIds = [] } = {}) => {
                const { selectedIds, selectionAnchorId } = get()
                const anchorIndex = visibleIds.indexOf(selectionAnchorId)
                const index = visibleIds.indexOf(id)

                if (range && anchorIndex !== -1 && index !== -1) {
                    const ids = visibleIds.slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1)
                    set({ selectedId: id, selectedIds: toggle ? [...new Set([...selectedIds, ...ids])] : ids })
                    return
                }

                const ids = toggle
                    ? selectedIds.includes(id)
                        ? selectedIds.filter((selected) => selected !== id)
                        : [...selectedIds, id]
                    : id
                    ? [id]
                    : []

                set({
                    selectedId: ids.includes(id) ? id : ids[ids.length - 1] || id,
                    selectedIds: ids,
                    selectionAnchorId: id,
                })
            },
            reconcileSelection: (visibleIds) => {
                const { selectedId, selectedIds, selectionAnchorId, actions } = get()
                const ids = selectedIds.filter((id) => visibleIds.includes(id))

                if (!visibleIds.includes(selectedId)) {
                    if (ids.length) set({ selectedId: ids[0], selectedIds: ids, selectionAnchorId: ids[0] })
                    else if (selectedId || visibleIds.length) actions.select(visibleIds[0] || '')
                    return
                }

                if (ids.length !== selectedIds.length) set({ selectedIds: ids })
                if (selectionAnchorId && !visibleIds.includes(selectionAnchorId)) set({ selectionAnchorId: selectedId })
            },
            setDraggedNotes: (draggedNoteIds) => set({ draggedNoteIds }),
            dropNotes: (targetId) => {
                const { draggedNoteIds, notes, actions } = get()
                const trashedAt = new Date().toISOString()

                set({ draggedNoteIds: [] })

                for (const id of draggedNoteIds) {
                    const note = notes.find((note) => note.id === id)
                    if (!note || note.trashedAt) continue

                    if (targetId === 'trash') actions.updateNote(id, { trashedAt })
                    else actions.addNoteTag(id, targetId)
                }
            },
            setFilter: (filter) =>
                set({ filter, search: '', selectedId: '', selectedIds: [], selectionAnchorId: '', focusMode: false }),
            setSearch: (search) => set({ search }),
            setNoteSort: (noteSort) => {
                if (!isNoteSort(noteSort)) return
                set({ noteSort })
                try {
                    localStorage.setItem('noted-note-sort', noteSort)
                } catch (error) {
                    get().actions.setError(error)
                }
            },
            setReadingFontSize: (size) => {
                const readingFontSize = clampReadingFontSize(size)
                set({ readingFontSize })
                try {
                    localStorage.setItem('noted-reading-font-size', String(readingFontSize))
                } catch (error) {
                    get().actions.setError(error)
                }
            },
            setError: (error) => set({ error: error ? errorText(error) : '' }),
            toggleFocus: () => set((state) => ({ focusMode: state.filter !== 'upcoming' && !state.focusMode })),
            createNote: async () => {
                try {
                    await get().actions.flush()
                    const { filter } = get()
                    const created = await notesAPI().createNote(
                        get().tags.some((tag) => tag.id === filter) ? [filter] : []
                    )
                    const [note] = hydrateNotes([created])
                    set((state) => ({
                        notes: [note, ...state.notes],
                        selectedId: note.id,
                        selectedIds: [note.id],
                        selectionAnchorId: note.id,
                        search: '',
                        filter: ['trash', 'pinned', 'upcoming'].includes(filter) ? 'all' : filter,
                    }))
                } catch (error) {
                    get().actions.setError(error)
                }
            },
            importFile: async (data, noteId, attachmentName) => {
                if (attachmentName !== undefined) {
                    if (!window.blot?.importAttachment) throw new Error('Restart Blot to attach files.')

                    return notesAPI().importAttachment(data, noteId, attachmentName)
                }
                if (!window.blot?.importImage) throw new Error('Restart Blot to add images.')

                return notesAPI().importImage(data, noteId)
            },
            queueFileImport: (importing) => {
                pendingImports.add(importing)
                set({ status: 'saving' })
                importing
                    .finally(() => {
                        pendingImports.delete(importing)
                        if (!pendingImports.size && !pending.size && !pendingTags.size && !saving)
                            set({ status: 'saved' })
                    })
                    .catch(get().actions.setError)
            },
            rescheduleTask: (noteId, originalBody, task, schedule) => {
                const { notes, actions, locking, privacy } = get()
                const note = notes.find((note) => note.id === noteId)
                if (!note || note.trashedAt || (note.encrypted && (locking || !privacy.unlocked))) return

                // An older note acquires a stable schedule ID on its first edit. Never use
                // a stale position after a sync or paste has rearranged the checklist.
                const current =
                    note.body === originalBody
                        ? note.scheduledTasks.find((item) => item.index === task.index)
                        : task.schedule.id && note.scheduledTasks.find((item) => item.schedule.id === task.schedule.id)
                if (!current || JSON.stringify(current.schedule) !== JSON.stringify(task.schedule)) {
                    actions.setError('This task changed. Drag its current calendar entry to reschedule it.')
                    return
                }

                const template = document.createElement('template')
                template.innerHTML = note.body
                const items = Array.from(template.content.querySelectorAll('li[data-type="taskItem"]')).filter(
                    (item) => !item.closest('pre, code, script, style')
                )
                const item = items[current.index]
                if (!item) return

                item.setAttribute('data-schedule', JSON.stringify(schedule))
                item.setAttribute('data-due-date', schedule.start.slice(0, 10))
                actions.updateNote(noteId, { body: template.innerHTML })
            },
            updateNote: (id, changes) => {
                const note = get().notes.find((note) => note.id === id)
                if (!note || (note.encrypted && !get().privacy.unlocked && !get().locking)) return
                const update = {
                    ...changes,
                    versions: pending.get(id)?.versions || note.versions,
                    ...(changes.body !== undefined
                        ? { ...countChecklist(changes.body), images: documentImages(changes.body) }
                        : {}),
                }
                pending.set(id, { ...pending.get(id), ...update })
                set((state) => ({
                    notes: state.notes.map((note) =>
                        note.id === id ? { ...note, ...update, updatedAt: new Date().toISOString() } : note
                    ),
                    status: 'saving',
                }))
                clearTimeout(timer)
                timer = setTimeout(
                    () =>
                        get()
                            .actions.flush()
                            .catch(() => {}),
                    300
                )
            },
            addNoteTag: (noteId, tagId) => {
                const { notes, tags, actions } = get()
                const note = notes.find((note) => note.id === noteId)
                const tag = tags.find((tag) => tag.id === tagId)
                if (!note || note.trashedAt || !tag || note.encrypted) return
                const path = hashtagPath(tags, tag)
                const paths = new Set(documentTagPaths(note.title, note.body).map(pathKey))
                if (paths.has(pathKey(path))) return
                paths.add(pathKey(path))
                const body = `${note.body}<p>${escapeHtml(formatHashtag(path))}</p>`
                actions.updateNote(noteId, {
                    body,
                    text: bodyText(body),
                    tagIds: tags.filter((tag) => paths.has(pathKey(hashtagPath(tags, tag)))).map((tag) => tag.id),
                })
            },
            queueTagSave: (save, delay = 300) => {
                pendingTags.add(save)
                set({ status: 'saving' })
                clearTimeout(timer)
                if (delay)
                    timer = setTimeout(
                        () =>
                            get()
                                .actions.flush()
                                .catch(() => {}),
                        delay
                    )
                else
                    void get()
                        .actions.flush()
                        .catch(() => {})
            },
            cancelTagSave: (save) => {
                pendingTags.delete(save)
                if (!pending.size && !pendingTags.size && !pendingImports.size && !saving) set({ status: 'saved' })
            },
            flush: async () => {
                clearTimeout(timer)
                while (pendingImports.size) await Promise.all(pendingImports)
                if (saving) await saving
                if (!pending.size && !pendingTags.size) return

                saving = (async () => {
                    try {
                        while (pending.size || pendingTags.size) {
                            if (pending.size) {
                                const [id, changes] = pending.entries().next().value!
                                pending.delete(id)
                                try {
                                    const { scheduledTasks, ...edits } = changes
                                    const saved = await notesAPI().updateNote(id, edits)
                                    const current = get().notes.find((note) => note.id === id)

                                    // Advance our revision before awaiting the snapshot so typing extends this save.
                                    if (
                                        saved.savedVersion &&
                                        current?.versions &&
                                        changes.versions &&
                                        current.versions.length === changes.versions.length &&
                                        current.versions.every((version) => changes.versions!.includes(version))
                                    ) {
                                        const versions = [saved.savedVersion]
                                        const newer = pending.get(id)
                                        if (newer) pending.set(id, { ...newer, versions })

                                        set((state) => ({
                                            notes: state.notes.map((note) =>
                                                note.id === id ? { ...note, versions } : note
                                            ),
                                        }))
                                    }

                                    await syncSnapshot()
                                } catch (error) {
                                    pending.set(id, { ...changes, ...pending.get(id) })
                                    throw error
                                }
                            } else {
                                const save = pendingTags.values().next().value!
                                pendingTags.delete(save)
                                try {
                                    await save(persistTag)
                                } catch (error) {
                                    pendingTags.add(save)
                                    throw error
                                }
                            }
                        }
                        set({ status: pendingImports.size ? 'saving' : 'saved' })
                    } catch (error) {
                        set({ status: 'error', error: errorText(error) })
                        throw error
                    }
                })()

                try {
                    await saving
                } finally {
                    saving = null
                }
            },
            saveTag: async (tag) => {
                await get().actions.flush()
                return persistTag(tag)
            },
            deleteTag: async (id) => {
                await get().actions.flush()
                await notesAPI().deleteTag(id)
                const ids = new Set([id, ...getDescendantIds(get().tags, id)])
                set((state) => ({
                    tags: state.tags.filter((tag) => !ids.has(tag.id)),
                    notes: state.notes.map((note) => ({ ...note, tagIds: note.tagIds.filter((tag) => !ids.has(tag)) })),
                    filter: ids.has(state.filter) ? 'all' : state.filter,
                }))
            },
            deleteNote: async (id) => {
                await get().actions.flush()
                await notesAPI().deleteNote(id)
                await syncSnapshot()
                get().actions.select('')
            },
        },
    }
})
