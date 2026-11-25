import {
    Button,
    DragElement,
    DragElementArea,
    Flexer,
    Heading,
    IconLib,
    Input,
    MenuProvider,
    Text,
    View,
    useDrag,
    useWindowEvent,
} from '@fold-ui/core'
import { useEffect, type KeyboardEvent, type MouseEvent } from 'react'
import { useAppStore } from '@/store/app'
import { getDescendantIds } from '@/helpers/hierarchy'
import { tagPath } from '@/helpers/tags'
import { NoteListItem } from '@/components/note-list-item'
import { NoteEditor } from '@/components/note-editor'
import { MinimizeHeader } from '@/components/minimize-header'
import { Resize } from './sidebar.layout'
import { BlotOctopus } from '@/components/common/blot-octopus'
import { NoteSortMenu } from '@/components/note-sort-menu'
import { NoteMenu } from '@/menus/note.menu'
import { isCalendarNote } from '@/helpers/checklist'
import { compareNotes } from '@/helpers/note-sort'
import { escapeHtml } from '@/helpers/hashtags'
import type { Note } from '@/types'

const NotePanes = () => {
    const unlocked = useAppStore((state) => state.privacy.unlocked && !state.locking)
    const notes = useAppStore((state) => state.notes)
    const tags = useAppStore((state) => state.tags)
    const selectedId = useAppStore((state) => state.selectedId)
    const selectedIds = useAppStore((state) => state.selectedIds)
    const filter = useAppStore((state) => state.filter)
    const search = useAppStore((state) => state.search)
    const loading = useAppStore((state) => state.loading)
    const focusMode = useAppStore((state) => state.focusMode)
    const noteSort = useAppStore((state) => state.noteSort)
    const actions = useAppStore((state) => state.actions)
    const { setCustomGhostElement, setCustomGhostElementRotation } = useDrag()
    const tag = tags.find((tag) => tag.id === filter)
    const title = tag
        ? tagPath(tags, tag)
        : { all: 'All notes', pinned: 'Pinned', untagged: 'Untagged', trash: 'Trash' }[filter]
    const tagIds = new Set([filter, ...getDescendantIds(tags, filter)])
    const query = search.trim().toLowerCase()
    const visible = notes
        .filter((note) => {
            if (isCalendarNote(note.id)) return false
            if (filter === 'trash' ? !note.trashedAt : !!note.trashedAt) return false
            if (filter === 'pinned' && !note.pinned) return false
            if (filter === 'untagged' && note.tagIds.length) return false
            if (tag && !note.tagIds.some((id) => tagIds.has(id))) return false
            const labelText = tags
                .filter((tag) => note.tagIds.includes(tag.id))
                .map((tag) => tagPath(tags, tag))
                .join(' ')
            if (note.encrypted && !unlocked) return `${note.title} ${labelText}`.toLowerCase().includes(query)
            return `${note.title} ${note.text} ${labelText}`.toLowerCase().includes(query)
        })
        .sort((a, b) => compareNotes(a, b, noteSort))
    const note = notes.find((note) => note.id === selectedId)
    const visibleIds = visible.map((note) => note.id)
    const openTagNoteId = tag && !query && note && !note.trashedAt ? note.id : undefined

    const selectNote = (id: string, event: MouseEvent | KeyboardEvent) => {
        actions.select(id, { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey, visibleIds })
    }

    const startNoteDrag = (note: Note) => {
        const ids = selectedIds.includes(note.id) ? selectedIds.filter((id) => visibleIds.includes(id)) : [note.id]
        if (!selectedIds.includes(note.id)) actions.select(note.id)

        actions.setDraggedNotes(ids)
        setCustomGhostElementRotation('0deg')
        const title = ids.length > 1 ? `${ids.length} notes` : note.title.trim() || 'Untitled note'
        setCustomGhostElement(
            `<div class="f-card note-drag-ghost"><span class="f-text md f-ellipsis">${escapeHtml(title)}</span></div>`
        )
    }

    useEffect(() => {
        actions.reconcileSelection(visibleIds, openTagNoteId)
    }, [selectedId, selectedIds, visibleIds, openTagNoteId, actions])

    useEffect(() => () => actions.setDraggedNotes([]), [actions])

    useWindowEvent('mouseup', () => actions.setDraggedNotes([]))
    useWindowEvent('blur', () => actions.setDraggedNotes([]))
    useWindowEvent('keydown', (event) => {
        if (event.key === 'Escape') actions.setDraggedNotes([])
    })

    return (
        <View
            row
            flex={1}
            height="100%"
            alignItems="stretch"
            justifyContent="flex-start"
            bgToken="surface"
            className="frame notes-frame">
            {!focusMode && (
                <Resize>
                    <MinimizeHeader>
                        <Heading
                            as="h5"
                            className="f-ellipsis"
                            fontWeight="var(--main-heading-font-weight)"
                            fontSize="var(--main-heading-font-size)">
                            {title}
                        </Heading>
                        <Text
                            size="sm"
                            colorToken="text-weaker">
                            {visible.length}
                        </Text>
                        <Flexer />
                        <NoteSortMenu />
                    </MinimizeHeader>
                    <View
                        row
                        p="1rem"
                        shrink={0}
                        width="100%">
                        <Input
                            flex={1}
                            style={{ minWidth: 0 }}
                            type="search"
                            aria-label="Search notes and text"
                            placeholder="Search notes…"
                            value={search}
                            onChange={(event) => actions.setSearch(event.target.value)}
                            width="100%"
                            size="sm"
                        />
                    </View>
                    <DragElementArea
                        className="note-list-scroll f-scrollbar"
                        areaId="blot-notes"
                        group="blot-notes"
                        variant="focus"
                        targetVariant={{ 'blot-tags': 'focus', 'blot-navigation': 'focus' }}>
                        {visible.map((note) => (
                            <DragElement
                                key={note.id}
                                id={note.id}
                                className="note-list-drag-item"
                                noDrop
                                noDrag={!!note.trashedAt || note.encrypted}
                                onMouseDown={() => startNoteDrag(note)}>
                                <NoteListItem
                                    note={note}
                                    isOpen={selectedIds.includes(note.id)}
                                    onOpen={(event) => selectNote(note.id, event)}
                                />
                            </DragElement>
                        ))}
                        {!visible.length && (
                            <View
                                column
                                flex={1}
                                width="100%"
                                gap={12}
                                p="40px 24px">
                                <IconLib
                                    icon={filter === 'trash' ? 'trash' : 'documents'}
                                    size="xl"
                                    style={{ '--f-icon-sizing-xl': 'calc(var(--f-icon-size-xl) * 2)' }}
                                    color="var(--f-color-text-weakest)"
                                />
                                <Text
                                    colorToken="text-weaker"
                                    textAlign="center">
                                    {loading
                                        ? 'Opening your notes…'
                                        : query
                                        ? 'No matching notes.'
                                        : filter === 'trash'
                                        ? 'Trash is empty.'
                                        : 'No notes here yet.'}
                                </Text>
                            </View>
                        )}
                    </DragElementArea>
                </Resize>
            )}
            {note?.encrypted && !unlocked ? (
                <View
                    column
                    flex={1}
                    gap={16}
                    p={32}>
                    <BlotOctopus />
                    <Text colorToken="text-weaker">This note is locked.</Text>
                    <Button
                        size="sm"
                        onClick={() => actions.requestUnlock()}>
                        Unlock Blot
                    </Button>
                </View>
            ) : note ? (
                <NoteEditor
                    key={note.id}
                    note={note}
                />
            ) : (
                <View
                    column
                    flex={1}
                    gap={16}
                    p={32}>
                    <BlotOctopus />
                </View>
            )}
        </View>
    )
}

export const NotesLayout = () => (
    <MenuProvider
        menu={({ data, dismiss }) => (
            <NoteMenu
                noteId={data.id}
                onDismiss={dismiss}
            />
        )}>
        <NotePanes />
    </MenuProvider>
)
