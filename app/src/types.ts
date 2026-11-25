export type Tag = {
    id: string
    text: string
    color: string
    icon: string
    parentId: string | null
    position: number
    collapsed: boolean
}

export type ChecklistCounts = {
    checklistTotal: number
    checklistChecked: number
}

export type Note = ChecklistCounts & {
    encrypted: boolean
    versions: string[]
    id: string
    title: string
    body: string
    images: string[]
    text: string
    tagIds: string[]
    pinned: boolean
    trashedAt: string | null
    createdAt: string
    updatedAt: string
}

export type NoteChanges = Partial<
    Pick<Note, 'title' | 'body' | 'text' | 'tagIds' | 'pinned' | 'trashedAt' | 'versions'>
>
export type PrivacyState = { pinSet: boolean; unlocked: boolean }
export type Snapshot = { notes: Note[]; tags: Tag[]; privacy: PrivacyState }
export type SyncStatus = {
    locked?: boolean
    folder: string | null
    lastSync: string | null
    error: string
    waiting: number
}
export type SyncResult = { status: SyncStatus; snapshot?: Snapshot }
export type MarkdownExport = { count: number; directory: string }
export type MarkdownImport = { count: number; snapshot: Snapshot; missingImages: string[] }
export type NotesAPI = {
    setPin(pin: string): Promise<Snapshot>
    clearPin(pin: string): Promise<Snapshot>
    unlock(pin: string): Promise<Snapshot>
    prepareLock(): Promise<void>
    lock(): Promise<Snapshot>
    setNoteEncrypted(id: string, encrypted: boolean): Promise<Snapshot>
    onLockRequest(callback: () => void): () => void
    exportMarkdown(): Promise<MarkdownExport | null>
    importMarkdown(): Promise<MarkdownImport | null>
    importImage(data: Uint8Array, noteId: string): Promise<string>
    importAttachment(data: Uint8Array, noteId: string, name: string): Promise<string>
    openAttachment(source: string, name: string): Promise<void>
    syncStatus(): Promise<SyncStatus>
    chooseSyncFolder(): Promise<SyncStatus>
    disconnectSync(): Promise<SyncStatus>
    syncNow(): Promise<SyncResult>
    onSyncRequest(callback: () => void): () => void
    snapshot(): Promise<Snapshot>
    createNote(tagIds: string[], kind?: 'calendar'): Promise<Note>
    updateNote(id: string, changes: NoteChanges): Promise<Note & { savedVersion?: string }>
    deleteNote(id: string): Promise<void>
    saveTag(tag: Partial<Tag> & { text: string }): Promise<Tag>
    deleteTag(id: string): Promise<void>
    backup(): Promise<string | null>
    openExternal(url: string): Promise<void>
    setWindowTheme(theme: 'light' | 'dark'): Promise<void>
    onBeforeClose(callback: () => Promise<void>): () => void
    onBackup(callback: () => void): () => void
}

declare global {
    interface Window {
        blot?: NotesAPI
    }
}
