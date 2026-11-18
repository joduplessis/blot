import { createHash } from 'node:crypto'
import type { Note } from '../../src/types'
import { attachmentFilePattern, imageFilePattern } from '../../src/helpers/note-files'
import { pathKey } from '../../src/helpers/hashtags'

export type SyncNote = Pick<Note, 'title' | 'body' | 'pinned' | 'trashedAt' | 'createdAt' | 'updatedAt'> & {
    encrypted?: boolean
}
export type SyncTag = { path: string; color: string; icon: string; position: number }
export type SyncRecord = {
    format: 1 | 2
    encryption?: { salt: string; verifier: string; content: string; images: string[] }
    id: string
    key: string
    parents: string[]
    value: SyncNote | SyncTag | null
}

export const noteValue = (note: SyncNote): SyncNote => ({
    title: note.title,
    body: note.body,
    pinned: note.pinned,
    trashedAt: note.trashedAt,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    ...(note.encrypted ? { encrypted: true } : {}),
})

export const makeRecord = (key: string, value: SyncRecord['value'], parents: string[] = []): SyncRecord => {
    const record = { format: 1 as const, key, parents: [...new Set(parents)].sort(), value }
    const id = createHash('sha256').update(JSON.stringify(record)).digest('hex')

    return { ...record, id }
}

export const conflictId = (record: SyncRecord) =>
    createHash('sha256').update(`conflict:${record.key}:${record.id}`).digest('hex')

export const parseRecord = (text: string): SyncRecord => {
    const record = JSON.parse(text)
    const hash = /^[a-f0-9]{64}$/
    const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))

    if (
        ![1, 2].includes(record?.format) ||
        typeof record.key !== 'string' ||
        !/^(note|tag)\/.+/.test(record.key) ||
        !hash.test(record.id) ||
        !Array.isArray(record.parents) ||
        record.parents.some((parent: unknown) => typeof parent !== 'string' || !hash.test(parent))
    )
        throw new Error('This folder contains an unsupported or damaged Blot change file.')

    if (record.format === 2) {
        const encryption = record.encryption
        if (
            !record.key.startsWith('note/') ||
            record.value !== null ||
            !encryption ||
            typeof encryption.salt !== 'string' ||
            Buffer.from(encryption.salt, 'base64').length !== 16 ||
            typeof encryption.verifier !== 'string' ||
            typeof encryption.content !== 'string' ||
            !Array.isArray(encryption.images) ||
            encryption.images.some(
                (file: unknown) =>
                    typeof file !== 'string' || (!imageFilePattern.test(file) && !attachmentFilePattern.test(file))
            )
        )
            throw new Error('Invalid encrypted note in sync folder.')

        return {
            format: 2,
            id: record.id,
            key: record.key,
            parents: record.parents,
            value: null,
            encryption: {
                salt: encryption.salt,
                verifier: encryption.verifier,
                content: encryption.content,
                images: encryption.images,
            },
        }
    }

    let value: SyncRecord['value'] = null
    if (record.value !== null) {
        const item = record.value
        if (record.key.startsWith('note/')) {
            if (
                !item ||
                typeof item.title !== 'string' ||
                typeof item.body !== 'string' ||
                typeof item.pinned !== 'boolean' ||
                (item.encrypted !== undefined && typeof item.encrypted !== 'boolean') ||
                !date(item.createdAt) ||
                !date(item.updatedAt) ||
                (item.trashedAt !== null && !date(item.trashedAt))
            )
                throw new Error('Invalid note in sync folder.')

            value = noteValue(item)
        } else {
            if (
                !item ||
                typeof item.path !== 'string' ||
                !item.path ||
                item.path.split('/').some((part: string) => !part.trim() || /[#\r\n]/.test(part)) ||
                record.key !== 'tag/' + pathKey(item.path) ||
                typeof item.color !== 'string' ||
                typeof item.icon !== 'string' ||
                !Number.isFinite(item.position)
            )
                throw new Error('Invalid tag in sync folder.')

            value = { path: item.path, color: item.color, icon: item.icon, position: item.position }
        }
    }
    const verified = makeRecord(record.key, value, record.parents)
    if (verified.id !== record.id) throw new Error('A Blot change file is incomplete or has been modified.')

    return verified
}
