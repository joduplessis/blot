import type { Note } from '../types'

export const NOTE_SORT_OPTIONS = [
    { value: 'updatedAt', label: 'Date updated' },
    { value: 'title', label: 'Title' },
    { value: 'createdAt', label: 'Date created' },
] as const

export type NoteSort = (typeof NOTE_SORT_OPTIONS)[number]['value']

export const isNoteSort = (value: unknown): value is NoteSort =>
    NOTE_SORT_OPTIONS.some((option) => option.value === value)

const titles = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export const compareNotes = (a: Note, b: Note, sort: NoteSort) => {
    const pinned = Number(b.pinned) - Number(a.pinned)
    const order =
        sort === 'title'
            ? titles.compare(a.title.trim() || 'Untitled note', b.title.trim() || 'Untitled note')
            : b[sort].localeCompare(a[sort])
    return pinned || order || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)
}

export const readNoteSort = (): NoteSort => {
    try {
        const value = localStorage.getItem('noted-note-sort')
        return isNoteSort(value) ? value : 'updatedAt'
    } catch {
        return 'updatedAt'
    }
}
