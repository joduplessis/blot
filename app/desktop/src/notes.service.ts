import { DatabaseSync, backup } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { decrypt, deriveKey, encrypt } from './encryption'
import type { Note, NoteChanges, Tag, Snapshot } from '../../src/types'
import {
    conflictId,
    makeRecord,
    noteValue,
    parseRecord,
    type SyncRecord,
    type SyncNote,
    type SyncTag,
} from './sync-record'
import { countChecklist } from '../../src/helpers/checklist'
import { documentFiles, documentImages, hasNoteFiles } from '../../src/helpers/note-files'
import { NoteFilesService } from './note-files.service'
import {
    bodyText,
    documentTagPaths,
    escapeHtml,
    formatHashtag,
    hashtagPath,
    pathKey,
    renamedPaths,
    renameDocumentHashtags,
} from '../../src/helpers/hashtags'

export class NotesService {
    private db: DatabaseSync
    readonly files: NoteFilesService
    private encryptionKey: Buffer | null = null
    private pin: string | null = null
    private syncKeys = new Map<string, Buffer>()
    private unlocked = false
    private unlockAfter = 0

    constructor(directory: string) {
        this.files = new NoteFilesService(directory)
        mkdirSync(directory, { recursive: true })
        this.db = new DatabaseSync(path.join(directory, 'noted.sqlite'))
        this.db.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA secure_delete = ON;
            PRAGMA busy_timeout = 5000;
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
                text TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0,
                trashed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY, text TEXT NOT NULL, color TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '',
                parent_id TEXT REFERENCES tags(id) ON DELETE SET NULL,
                position REAL NOT NULL, collapsed INTEGER NOT NULL DEFAULT 0
            );
            CREATE UNIQUE INDEX IF NOT EXISTS tag_sibling_name ON tags(COALESCE(parent_id, ''), text COLLATE NOCASE);
            CREATE TABLE IF NOT EXISTS note_tags (
                note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY(note_id, tag_id)
            );
            CREATE INDEX IF NOT EXISTS note_tags_tag ON note_tags(tag_id);
            CREATE INDEX IF NOT EXISTS notes_updated ON notes(trashed_at, pinned, updated_at DESC);
            CREATE TABLE IF NOT EXISTS sync_versions (id TEXT PRIMARY KEY, key TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS sync_versions_key ON sync_versions(key);
            CREATE TABLE IF NOT EXISTS sync_parents (version TEXT NOT NULL, parent TEXT NOT NULL, PRIMARY KEY(version, parent));
            CREATE INDEX IF NOT EXISTS sync_parents_parent ON sync_parents(parent);
            CREATE TABLE IF NOT EXISTS pin_settings (id INTEGER PRIMARY KEY CHECK(id = 1), salt TEXT NOT NULL, verifier TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS private_notes (id TEXT PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS sync_settings (id INTEGER PRIMARY KEY CHECK(id = 1), folder TEXT, last_sync TEXT);
            INSERT OR IGNORE INTO sync_settings (id) VALUES (1);
        `)
        const columns = this.db.prepare('PRAGMA table_info(tags)').all()
        if (!columns.some((column) => column.name === 'icon')) {
            this.db.exec("ALTER TABLE tags ADD COLUMN icon TEXT NOT NULL DEFAULT ''")
        }
        const version = Number(this.db.prepare('PRAGMA user_version').get()!.user_version)
        if (version < 3) this.migrateHashtags()
        if (version < 4) this.migrateChecklists()
        if (version < 5) this.migrateImages()
        if (version < 6) {
            this.transaction(() => this.db.exec('ALTER TABLE notes ADD COLUMN encrypted TEXT; PRAGMA user_version = 6'))
        }

        this.transaction(() => {
            const initializeTags = !this.db.prepare('SELECT 1 FROM sync_versions LIMIT 1').get()
            for (const row of this.db
                .prepare(
                    `
                SELECT notes.* FROM notes WHERE NOT EXISTS (
                    SELECT 1 FROM sync_versions WHERE key = 'note/' || notes.id
                )
            `
                )
                .all())
                this.addRecord(makeRecord('note/' + row.id, noteValue(this.note(row, []))))

            const tags = this.allTags()
            for (const tag of initializeTags ? tags : []) {
                if (!this.heads('tag/' + pathKey(hashtagPath(tags, tag))).length) this.recordTag(tag, tags)
            }
        })
    }

    private requireKey(): Buffer {
        if (!this.encryptionKey) throw new Error('Unlock Blot first.')

        return this.encryptionKey
    }

    private isPrivate(id: string) {
        return !!this.db.prepare('SELECT 1 FROM private_notes WHERE id = ?').get(id)
    }

    private encryptRecord(record: SyncRecord): SyncRecord {
        const settings = this.db.prepare('SELECT salt, verifier FROM pin_settings').get()!

        return {
            format: 2,
            id: record.id,
            key: record.key,
            parents: record.parents,
            value: null,
            encryption: {
                salt: String(settings.salt),
                verifier: String(settings.verifier),
                content: encrypt(JSON.stringify(record), this.requireKey()),
                // Previously removed files remain available in retained history.
                images: record.value ? documentFiles((record.value as SyncNote).body) : [],
            },
        }
    }

    private readRecord(payload: string): SyncRecord {
        const record: SyncRecord = JSON.parse(payload)
        if (!record.encryption) return record
        const { salt, verifier, content } = record.encryption
        if (!this.pin) throw new Error('Unlock Blot to sync protected notes.')
        let key = this.syncKeys.get(salt)

        if (!key) {
            key = deriveKey(this.pin, salt)
            try {
                // This verifier is part of the persisted encryption format, independent of the app name.
                if (decrypt(verifier, key) !== 'Kraken PIN') throw new Error()
            } catch {
                key.fill(0)
                throw new Error('A synced note uses a different PIN. Use the same PIN on your devices.')
            }
            this.syncKeys.set(salt, key)
        }
        const original = parseRecord(decrypt(content, key))
        if (
            original.id !== record.id ||
            original.key !== record.key ||
            JSON.stringify(original.parents) !== JSON.stringify(record.parents)
        )
            throw new Error('An encrypted change file has been modified.')

        return original
    }

    prepareSync(records: SyncRecord[]): boolean {
        const encryption = records.find((record) => record.encryption)?.encryption
        if (encryption && !this.privacy().pinSet) {
            this.db
                .prepare('INSERT INTO pin_settings (id, salt, verifier) VALUES (1, ?, ?)')
                .run(encryption.salt, encryption.verifier)
        }

        return !this.privacy().pinSet || this.unlocked
    }

    private privacy() {
        return { pinSet: !!this.db.prepare('SELECT 1 FROM pin_settings').get(), unlocked: this.unlocked }
    }

    setPin(pin: string): Snapshot {
        if (this.privacy().pinSet) throw new Error('Clear the current PIN before adding a new one.')

        const salt = randomBytes(16).toString('base64')
        const key = deriveKey(pin, salt)
        this.db
            .prepare('INSERT INTO pin_settings (id, salt, verifier) VALUES (1, ?, ?)')
            .run(salt, encrypt('Kraken PIN', key))
        this.encryptionKey = key
        this.pin = pin
        this.unlocked = true

        return this.snapshot()
    }

    private checkPin(pin: string) {
        if (Date.now() < this.unlockAfter) throw new Error('Please wait a moment before trying again.')
        const settings = this.db.prepare('SELECT salt, verifier FROM pin_settings').get()
        if (!settings) throw new Error('Set up a PIN first.')
        const key = deriveKey(pin, String(settings.salt))

        try {
            if (decrypt(String(settings.verifier), key) !== 'Kraken PIN') throw new Error()
        } catch {
            key.fill(0)
            this.unlockAfter = Date.now() + 1500
            throw new Error('That PIN is incorrect.')
        }

        return key
    }

    unlock(pin: string): Snapshot {
        const key = this.checkPin(pin)
        this.encryptionKey?.fill(0)
        this.encryptionKey = key
        this.pin = pin
        this.unlocked = true

        // Restore visible titles and tag memberships for older protected notes.
        this.transaction(() => {
            const update = this.db.prepare('UPDATE notes SET title = ? WHERE id = ?')
            for (const row of this.db
                .prepare('SELECT id, title, encrypted FROM notes WHERE encrypted IS NOT NULL')
                .all()) {
                const { title, body } = JSON.parse(decrypt(String(row.encrypted), key))
                if (!row.title && title) update.run(title, row.id)

                this.syncTags(String(row.id), title, body)
            }
        })

        return this.snapshot()
    }

    hidePrivateNotes() {
        // Hide reads immediately on suspend; keep the key only until pending writes finish.
        this.unlocked = false
    }

    lock(): Snapshot {
        this.hidePrivateNotes()
        this.encryptionKey?.fill(0)
        this.encryptionKey = null
        this.pin = null
        for (const key of this.syncKeys.values()) key.fill(0)
        this.syncKeys.clear()

        return this.snapshot()
    }

    private rewriteHistory(id: string, encrypted: boolean) {
        const rows = this.db.prepare('SELECT id, payload FROM sync_versions WHERE key = ?').all('note/' + id)
        const update = this.db.prepare('UPDATE sync_versions SET payload = ? WHERE id = ?')

        for (const row of rows) {
            const record = this.readRecord(String(row.payload))
            const payload = JSON.stringify(record)
            update.run(encrypted ? JSON.stringify(this.encryptRecord(record)) : payload, row.id)
        }
    }

    setNoteEncrypted(id: string, encrypted: boolean): Snapshot {
        if (typeof encrypted !== 'boolean') throw new Error('Invalid note protection.')
        if (!this.unlocked) throw new Error('Unlock Blot first.')
        const note = this.getNote(id)
        if (note.encrypted === encrypted) return this.snapshot()

        if (encrypted && hasNoteFiles(note.body))
            throw new Error('Notes with images or attachments cannot be encrypted.')

        this.transaction(() => this.changeNoteEncryption(note, encrypted))
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')

        return this.snapshot()
    }

    private changeNoteEncryption(note: Note, encrypted: boolean) {
        if (encrypted) this.db.prepare('INSERT OR IGNORE INTO private_notes (id) VALUES (?)').run(note.id)
        else this.db.prepare('DELETE FROM private_notes WHERE id = ?').run(note.id)

        this.rewriteHistory(note.id, encrypted)
        const value = noteValue({ ...note, encrypted, updatedAt: new Date().toISOString() })
        this.addRecord(makeRecord('note/' + note.id, value, note.versions))
        this.writeNote(note.id, value)
    }

    async importFile(data: Uint8Array, noteId: string, attachmentName?: string): Promise<string> {
        if (this.isPrivate(noteId)) throw new Error('Images and attachments cannot be added to encrypted notes.')

        return this.files.import(data, attachmentName)
    }

    clearPin(pin: string): Snapshot {
        this.unlock(pin)
        const notes = this.snapshot().notes.filter((note) => note.encrypted)

        this.transaction(() => {
            for (const note of notes) this.changeNoteEncryption(note, false)
            for (const row of this.db
                .prepare("SELECT DISTINCT key FROM sync_versions WHERE json_extract(payload, '$.format') = 2")
                .all())
                this.rewriteHistory(String(row.key).slice(5), false)
            this.db.exec('DELETE FROM private_notes; DELETE FROM pin_settings')
        })

        return this.lock()
    }

    private transaction<T>(callback: () => T): T {
        this.db.exec('BEGIN IMMEDIATE')

        try {
            const result = callback()
            this.db.exec('COMMIT')
            return result
        } catch (error) {
            this.db.exec('ROLLBACK')
            throw error
        }
    }

    private note(
        row: any,
        tagIds: string[],
        versions = this.db
            .prepare(
                'SELECT id FROM sync_versions v WHERE key = ? AND NOT EXISTS (SELECT 1 FROM sync_parents WHERE parent = v.id)'
            )
            .all('note/' + row.id)
            .map((record) => String(record.id))
    ): Note {
        const content =
            row.encrypted && this.unlocked
                ? JSON.parse(decrypt(row.encrypted, this.requireKey()))
                : { title: row.title, body: row.body }

        return {
            encrypted: !!row.encrypted,
            id: row.id,
            versions,
            title: content.title,
            body: content.body,
            images: JSON.parse(row.images || '[]'),
            text: row.encrypted ? bodyText(content.body) : row.text,
            checklistTotal: row.checklist_total ?? 0,
            checklistChecked: row.checklist_checked ?? 0,
            pinned: !!row.pinned,
            trashedAt: row.trashed_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            tagIds,
        }
    }

    private getNote(id: string): Note {
        const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
        if (!row) throw new Error('This note no longer exists.')

        const tags = this.db.prepare('SELECT tag_id FROM note_tags WHERE note_id = ?').all(id)
        return this.note(
            row,
            tags.map((tag) => String(tag.tag_id))
        )
    }

    private allTags(): Tag[] {
        return this.db
            .prepare('SELECT * FROM tags ORDER BY position, text')
            .all()
            .map((row: any) => ({
                id: row.id,
                text: row.text,
                color: row.color,
                icon: row.icon,
                parentId: row.parent_id,
                position: row.position,
                collapsed: !!row.collapsed,
            }))
    }

    private migrateHashtags() {
        this.transaction(() => {
            const tags = this.allTags()
            for (const row of this.db.prepare('SELECT id FROM notes').all()) {
                const note = this.getNote(String(row.id))
                const paths = new Set(documentTagPaths(note.title, note.body).map(pathKey))
                const missing = tags.filter(
                    (tag) => note.tagIds.includes(tag.id) && !paths.has(pathKey(hashtagPath(tags, tag)))
                )
                const body =
                    note.body +
                    (missing.length
                        ? `<p>${missing.map((tag) => escapeHtml(formatHashtag(hashtagPath(tags, tag)))).join(' ')}</p>`
                        : '')
                this.db.prepare('UPDATE notes SET body = ?, text = ? WHERE id = ?').run(body, bodyText(body), note.id)
                this.syncTags(note.id, note.title, body)
            }
            this.db.exec('PRAGMA user_version = 3')
        })
    }

    private migrateChecklists() {
        this.transaction(() => {
            const columns = this.db.prepare('PRAGMA table_info(notes)').all()
            if (!columns.some((column) => column.name === 'checklist_total')) {
                this.db.exec('ALTER TABLE notes ADD COLUMN checklist_total INTEGER NOT NULL DEFAULT 0')
            }
            if (!columns.some((column) => column.name === 'checklist_checked')) {
                this.db.exec('ALTER TABLE notes ADD COLUMN checklist_checked INTEGER NOT NULL DEFAULT 0')
            }
            const update = this.db.prepare('UPDATE notes SET checklist_total = ?, checklist_checked = ? WHERE id = ?')
            for (const row of this.db.prepare('SELECT id, body FROM notes').all()) {
                const counts = countChecklist(String(row.body))
                update.run(counts.checklistTotal, counts.checklistChecked, row.id)
            }
            this.db.exec('PRAGMA user_version = 4')
        })
    }

    private migrateImages() {
        this.transaction(() => {
            this.db.exec("ALTER TABLE notes ADD COLUMN images TEXT NOT NULL DEFAULT '[]'")
            const update = this.db.prepare('UPDATE notes SET images = ? WHERE id = ?')
            for (const row of this.db.prepare('SELECT id, body FROM notes').all()) {
                update.run(JSON.stringify(documentImages(String(row.body))), row.id)
            }
            this.db.exec('PRAGMA user_version = 5')
        })
    }

    snapshot(): Snapshot {
        const membership = new Map<string, string[]>()
        for (const row of this.db.prepare('SELECT note_id, tag_id FROM note_tags').all()) {
            const id = String(row.note_id)
            membership.set(id, [...(membership.get(id) || []), String(row.tag_id)])
        }

        const versions = new Map<string, string[]>()
        for (const row of this.db
            .prepare(
                `
            SELECT id, key FROM sync_versions v WHERE key LIKE 'note/%'
            AND NOT EXISTS (SELECT 1 FROM sync_parents WHERE parent = v.id)
        `
            )
            .all()) {
            const id = String(row.key).slice(5)
            versions.set(id, [...(versions.get(id) || []), String(row.id)])
        }
        const tags = this.allTags()
        const used = new Set([...membership.values()].flat())
        for (const id of used) {
            const parentId = tags.find((tag) => tag.id === id)?.parentId
            if (parentId) used.add(parentId)
        }
        return {
            privacy: this.privacy(),
            notes: this.db
                .prepare('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC')
                .all()
                .map((row) => this.note(row, membership.get(String(row.id)) || [], versions.get(String(row.id)) || [])),
            tags: tags.filter((tag) => used.has(tag.id)),
        }
    }

    createNote(tagIds: string[] = []): Note {
        return this.transaction(() => {
            const id = randomUUID()
            const now = new Date().toISOString()
            const tags = this.allTags()
            const selected = tags.filter((tag) => tagIds.includes(tag.id))
            const body = selected.length
                ? `<p></p><p>${selected.map((tag) => escapeHtml(formatHashtag(hashtagPath(tags, tag)))).join(' ')}</p>`
                : ''
            this.db
                .prepare('INSERT INTO notes (id, body, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
                .run(id, body, bodyText(body), now, now)
            this.syncTags(id, '', body, true)
            this.addRecord(makeRecord('note/' + id, noteValue(this.getNote(id))))

            return this.getNote(id)
        })
    }

    private setTags(id: string, tagIds: string[]) {
        if (!Array.isArray(tagIds) || tagIds.some((tag) => typeof tag !== 'string')) throw new Error('Invalid tags.')

        this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(id)
        const insert = this.db.prepare('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)')
        for (const tag of new Set(tagIds)) insert.run(id, tag)
    }

    private syncTags(id: string, title: string, body: string, capture = false) {
        const tags = this.allTags()
        const ids = documentTagPaths(title, body).map((path) => {
            let parentId: string | null = null
            for (const segment of path.split('/')) {
                const text = segment.normalize('NFC')
                let tag = tags.find((tag) => tag.parentId === parentId && pathKey(tag.text) === pathKey(text))
                if (!tag) {
                    tag = {
                        id: randomUUID(),
                        text,
                        color: '#986a9c',
                        icon: '',
                        parentId,
                        position: Date.now(),
                        collapsed: false,
                    }
                    this.db
                        .prepare(
                            'INSERT INTO tags (id, text, color, icon, parent_id, position) VALUES (?, ?, ?, ?, ?, ?)'
                        )
                        .run(tag.id, tag.text, tag.color, tag.icon, tag.parentId, tag.position)
                    tags.push(tag)
                    if (capture && !this.heads('tag/' + pathKey(hashtagPath(tags, tag))).length) {
                        this.recordTag(tag, tags)
                    }
                }
                parentId = tag.id
            }
            return parentId!
        })
        this.setTags(id, ids)
        if (capture) this.applyTagMetadata()
    }

    updateNote(id: string, changes: NoteChanges): Note & { savedVersion: string } {
        if (this.isPrivate(id)) this.requireKey()

        return this.transaction(() => {
            const key = 'note/' + id
            const parents = changes.versions || this.heads(key).map((record) => record.id)
            const bases = parents.map((version) => this.getRecord(version))
            if (!bases.length || bases.some((record) => !record || record.key !== key)) {
                throw new Error('This note has changed. Reopen it before editing.')
            }
            const base = bases.sort((a, b) => a!.id.localeCompare(b!.id)).find((record) => record?.value)
            if (!base) throw new Error('This note no longer exists.')

            const note = { ...(base.value as SyncNote), ...changes, updatedAt: new Date().toISOString() }
            if (typeof note.title !== 'string' || typeof note.body !== 'string')
                throw new Error('Note content must be text.')
            if (note.encrypted && hasNoteFiles(note.body))
                throw new Error('Images and attachments cannot be added to encrypted notes.')
            const record = makeRecord(key, noteValue(note), parents)
            this.addRecord(record)
            this.applyNote(key, true)

            const exists = this.db.prepare('SELECT id FROM notes WHERE id = ?').get(id)
            return { ...this.getNote(exists ? id : conflictId(record)), savedVersion: record.id }
        })
    }

    deleteNote(id: string) {
        const note = this.getNote(id)
        if (!note.trashedAt) throw new Error('Move this note to Trash first.')

        this.transaction(() => {
            this.addRecord(makeRecord('note/' + id, null, note.versions))
            this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
        })
    }

    importNotes(notes: Pick<Note, 'title' | 'body'>[]) {
        this.transaction(() => {
            const now = new Date().toISOString()

            for (const content of notes) {
                const id = randomUUID()
                const note = { ...content, pinned: false, trashedAt: null, createdAt: now, updatedAt: now }
                this.writeNote(id, note, true)
                this.addRecord(makeRecord('note/' + id, noteValue(note)))
            }
        })

        return { count: notes.length, snapshot: this.snapshot() }
    }

    saveTag(input: Partial<Tag> & { text: string }): Tag {
        return this.transaction(() => {
            const before = this.allTags()
            const tag = this.updateTag(input)
            const after = this.allTags()
            const previous = new Map(before.map((item) => [pathKey(hashtagPath(before, item)), item]))
            const current = new Set(after.map((item) => pathKey(hashtagPath(after, item))))

            for (const item of after) {
                const path = hashtagPath(after, item)
                const key = pathKey(path)
                const old = previous.get(key)
                if (
                    !old ||
                    hashtagPath(before, old) !== path ||
                    old.color !== item.color ||
                    old.icon !== item.icon ||
                    old.position !== item.position
                ) {
                    this.recordTag(item, after)
                }
            }
            for (const key of previous.keys()) {
                if (!current.has(key))
                    this.addRecord(
                        makeRecord(
                            'tag/' + key,
                            null,
                            this.heads('tag/' + key).map((item) => item.id)
                        )
                    )
            }

            return tag
        })
    }

    private updateTag(input: Partial<Tag> & { text: string }): Tag {
        if (!input.id) throw new Error('Create tags by typing a hashtag in a note.')
        const before = this.allTags()
        const row = input.id ? (this.db.prepare('SELECT * FROM tags WHERE id = ?').get(input.id) as any) : undefined
        const current = row
            ? {
                  id: row.id,
                  text: row.text,
                  color: row.color,
                  icon: row.icon,
                  parentId: row.parent_id,
                  position: row.position,
                  collapsed: !!row.collapsed,
              }
            : undefined
        if (input.id && !current) throw new Error('This tag no longer exists.')

        const tag: Tag = {
            id: randomUUID(),
            color: '#986a9c',
            icon: '',
            parentId: null,
            position: Date.now(),
            collapsed: false,
            ...current,
            ...input,
        }
        tag.text = tag.text.trim().normalize('NFC')
        tag.parentId = tag.parentId || null
        if (!tag.text) throw new Error('Give the tag a name.')
        if (/[#\/\r\n]/.test(tag.text)) throw new Error('Tag names cannot contain #, /, or line breaks.')
        if (typeof tag.icon !== 'string' || typeof tag.color !== 'string') throw new Error('Invalid tag appearance.')
        if (!Number.isFinite(tag.position)) throw new Error('Invalid tag position.')

        let parent = tag.parentId
        const seen = new Set([tag.id])
        while (parent) {
            if (seen.has(parent)) throw new Error('A tag cannot be nested inside itself or its children.')
            seen.add(parent)
            const row = this.db.prepare('SELECT parent_id FROM tags WHERE id = ?').get(parent)
            if (!row) throw new Error('The parent tag no longer exists.')
            parent = row.parent_id as string | null
        }

        const duplicate = before.find(
            (item) => item.parentId === tag.parentId && pathKey(item.text) === pathKey(tag.text) && item.id !== tag.id
        )
        if (duplicate) throw new Error('A tag with this name already exists here.')

        this.db
            .prepare(
                `INSERT INTO tags (id, text, color, icon, parent_id, position, collapsed) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET text = excluded.text, color = excluded.color, icon = excluded.icon,
            parent_id = excluded.parent_id, position = excluded.position, collapsed = excluded.collapsed`
            )
            .run(tag.id, tag.text, tag.color, tag.icon, tag.parentId, tag.position, tag.collapsed ? 1 : 0)
        const paths = renamedPaths(before, this.allTags())
        if (paths.size) {
            for (const row of this.db.prepare('SELECT * FROM notes').all()) {
                if (row.encrypted) continue

                const note = this.note(row, [])
                const changes = renameDocumentHashtags(note, paths)
                if (!Object.keys(changes).length) continue
                const updated = { ...note, ...changes }
                this.db
                    .prepare('UPDATE notes SET title = ?, body = ?, text = ?, updated_at = ? WHERE id = ?')
                    .run(updated.title, updated.body, updated.text, new Date().toISOString(), note.id)
                this.syncTags(note.id, updated.title, updated.body)
                this.addRecord(makeRecord('note/' + note.id, noteValue(this.getNote(note.id)), note.versions))
            }
        }
        return tag
    }

    deleteTag(id: string) {
        // Delete the subtree's tags only. Notes and their other memberships survive.
        this.transaction(() => {
            const descendants = this.db
                .prepare(
                    `WITH RECURSIVE descendants(id, depth) AS (
                SELECT id, 0 FROM tags WHERE id = ? UNION ALL
                SELECT tags.id, descendants.depth + 1 FROM tags JOIN descendants ON tags.parent_id = descendants.id
            ) SELECT id FROM descendants ORDER BY depth DESC`
                )
                .all(id)
            const tags = this.allTags()
            const remove = this.db.prepare('DELETE FROM tags WHERE id = ?')
            for (const row of descendants) {
                const tag = tags.find((tag) => tag.id === row.id)!
                const key = 'tag/' + pathKey(hashtagPath(tags, tag))
                this.addRecord(
                    makeRecord(
                        key,
                        null,
                        this.heads(key).map((record) => record.id)
                    )
                )
                remove.run(row.id)
            }
        })
    }

    private getRecord(id: string): SyncRecord | undefined {
        const row = this.db.prepare('SELECT payload FROM sync_versions WHERE id = ?').get(id)

        return row ? this.readRecord(String(row.payload)) : undefined
    }

    private heads(key: string): SyncRecord[] {
        return this.db
            .prepare(
                `
            SELECT payload FROM sync_versions v WHERE key = ?
            AND NOT EXISTS (SELECT 1 FROM sync_parents WHERE parent = v.id) ORDER BY id
        `
            )
            .all(key)
            .map((row) => this.readRecord(String(row.payload)))
    }

    private addRecord(record: SyncRecord) {
        this.db
            .prepare('INSERT OR IGNORE INTO sync_versions (id, key, payload) VALUES (?, ?, ?)')
            .run(
                record.id,
                record.key,
                !record.encryption && record.key.startsWith('note/') && this.isPrivate(record.key.slice(5))
                    ? JSON.stringify(this.encryptRecord(record))
                    : JSON.stringify(record)
            )
        const insert = this.db.prepare('INSERT OR IGNORE INTO sync_parents (version, parent) VALUES (?, ?)')
        for (const parent of record.parents) insert.run(record.id, parent)
    }

    private recordTag(tag: Tag, tags: Tag[]) {
        const value = { path: hashtagPath(tags, tag), color: tag.color, icon: tag.icon, position: tag.position }
        const key = 'tag/' + pathKey(value.path)
        this.addRecord(
            makeRecord(
                key,
                value,
                this.heads(key).map((record) => record.id)
            )
        )
    }

    private writeNote(id: string, note: SyncNote, capture = false) {
        if (note.encrypted) {
            if (hasNoteFiles(note.body)) throw new Error('Images and attachments cannot be added to encrypted notes.')
            if (!this.isPrivate(id)) {
                this.db.prepare('INSERT INTO private_notes (id) VALUES (?)').run(id)
                this.rewriteHistory(id, true)
            }
        } else this.db.prepare('DELETE FROM private_notes WHERE id = ?').run(id)

        const encrypted = note.encrypted
            ? encrypt(JSON.stringify({ title: note.title, body: note.body }), this.requireKey())
            : null
        const body = encrypted ? '' : note.body

        const counts = countChecklist(body)
        this.db
            .prepare(
                `
            INSERT INTO notes (id, title, body, text, pinned, trashed_at, created_at, updated_at, checklist_total, checklist_checked, images, encrypted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body, text = excluded.text,
            pinned = excluded.pinned, trashed_at = excluded.trashed_at, created_at = excluded.created_at,
            updated_at = excluded.updated_at, checklist_total = excluded.checklist_total,
            checklist_checked = excluded.checklist_checked, images = excluded.images, encrypted = excluded.encrypted
        `
            )
            .run(
                id,
                note.title,
                body,
                bodyText(body),
                note.pinned ? 1 : 0,
                note.trashedAt,
                note.createdAt,
                note.updatedAt,
                counts.checklistTotal,
                counts.checklistChecked,
                JSON.stringify(documentImages(body)),
                encrypted
            )
        this.syncTags(id, note.title, note.body, capture)
    }

    private applyNote(key: string, capture = false) {
        const heads = this.heads(key)
        // Deletion wins the original; concurrent content survives in a separate note.
        const winner = heads.find((record) => record.value === null) || heads[0]
        const id = key.slice(5)
        const content = (value: SyncRecord['value']) =>
            value &&
            JSON.stringify([
                (value as SyncNote).title,
                (value as SyncNote).body,
                (value as SyncNote).pinned,
                (value as SyncNote).trashedAt,
            ])

        for (const record of heads) {
            if (!record.value || content(record.value) === content(winner.value)) continue
            const copyId = conflictId(record)
            if (this.db.prepare('SELECT 1 FROM sync_versions WHERE key = ?').get('note/' + copyId)) continue

            const original = record.value as SyncNote
            const copy = { ...original, title: `${original.title || 'Untitled note'} (conflict)`, trashedAt: null }
            if (this.isPrivate(id)) this.db.prepare('INSERT OR IGNORE INTO private_notes (id) VALUES (?)').run(copyId)
            this.addRecord(makeRecord('note/' + copyId, noteValue(copy)))
            this.writeNote(copyId, copy)
        }
        if (winner.value) this.writeNote(id, winner.value as SyncNote, capture)
        else this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    }

    private applyTagMetadata() {
        const tags = this.allTags()
        const update = this.db.prepare('UPDATE tags SET text = ?, color = ?, icon = ?, position = ? WHERE id = ?')

        for (const tag of tags) {
            const heads = this.heads('tag/' + pathKey(hashtagPath(tags, tag)))
            if (!heads.length) continue
            const value = heads[0].value as SyncTag | null

            update.run(
                value?.path.split('/').pop() ?? tag.text,
                value?.color ?? '#986a9c',
                value?.icon ?? '',
                value?.position ?? tag.position,
                tag.id
            )
        }
    }

    syncRecords(): SyncRecord[] {
        return this.db
            .prepare('SELECT payload FROM sync_versions')
            .all()
            .map((row) => JSON.parse(String(row.payload)))
    }

    importRecords(records: SyncRecord[]) {
        if (!this.prepareSync(records)) throw new Error('Unlock Blot to sync protected notes.')
        for (const record of records) {
            if (record.encryption) this.readRecord(JSON.stringify(record))
        }

        return this.transaction(() => {
            const pending = new Map(
                records
                    .filter((record) => !this.db.prepare('SELECT 1 FROM sync_versions WHERE id = ?').get(record.id))
                    .map((record) => [record.id, record])
            )
            const changed = new Set<string>()
            let progress = true

            while (pending.size && progress) {
                progress = false
                for (const [id, record] of pending) {
                    const parents = record.parents.map((parent) => this.getRecord(parent))
                    if (parents.some((parent) => parent && parent.key !== record.key))
                        throw new Error('Invalid sync history.')
                    if (parents.some((parent) => !parent)) continue

                    this.addRecord(record)
                    changed.add(record.key)
                    pending.delete(id)
                    progress = true
                }
            }
            for (const key of changed) {
                if (key.startsWith('note/')) this.applyNote(key)
            }
            if (changed.size) this.applyTagMetadata()

            return { changed: changed.size > 0, waiting: pending.size }
        })
    }

    syncSettings(): { folder: string | null; lastSync: string | null } {
        const row = this.db.prepare('SELECT folder, last_sync FROM sync_settings WHERE id = 1').get()!

        return { folder: row.folder as string | null, lastSync: row.last_sync as string | null }
    }

    setSyncFolder(folder: string | null) {
        this.db.prepare('UPDATE sync_settings SET folder = ?, last_sync = NULL WHERE id = 1').run(folder)
    }

    syncCompleted() {
        this.db.prepare('UPDATE sync_settings SET last_sync = ? WHERE id = 1').run(new Date().toISOString())
    }

    async backup(file: string) {
        await backup(this.db, file)
        const snapshot = new DatabaseSync(file, { readOnly: true })

        try {
            const files = snapshot
                .prepare('SELECT payload FROM sync_versions')
                .all()
                .flatMap((row) => {
                    const record: SyncRecord = JSON.parse(String(row.payload))
                    if (record.encryption) return record.encryption.images

                    return record.key.startsWith('note/') && record.value
                        ? documentFiles((record.value as SyncNote).body)
                        : []
                })
            await this.files.backup([...new Set(files)], file + '.images')
        } finally {
            snapshot.close()
        }

        return file
    }

    close() {
        this.lock()
        this.db.close()
    }
}
