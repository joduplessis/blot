import type { Tag } from '@/types'
import { errorText } from '@/hooks/api.hooks'

export type TagChanges = Partial<Pick<Tag, 'text' | 'color' | 'icon'>>
export type TagSave = (tag: Partial<Tag> & { text: string }) => Promise<Tag>
export type TagSaveJob = (save: TagSave) => Promise<void>

// The store owns scheduling so drafts survive a menu closing and flush before quit.
export const createTagAutosave = (
    initial: Partial<Tag>,
    onSaved: (tag: Tag) => void,
    onError: (error: unknown) => void
) => {
    let current = { ...initial }
    let pending: TagChanges = {}
    let canceled = false

    const flush: TagSaveJob = async (save) => {
        if (canceled) return
        const changes = { ...pending }
        const name = (changes.text ?? current.text ?? '').trim()
        if (!current.id && !name) return
        pending = {}

        // An empty name never replaces an existing name or prevents an appearance edit.
        if (changes.text !== undefined) {
            if (name) changes.text = name
            else delete changes.text
        }
        for (const key of Object.keys(changes)) {
            if (changes[key] === current[key]) delete changes[key]
        }
        if (current.id && !Object.keys(changes).length) return

        try {
            const saved = await save(
                current.id
                    ? { id: current.id, text: current.text!, ...changes }
                    : { ...current, ...changes, text: name }
            )
            current = saved
            if (!canceled) onSaved(saved)
        } catch (error) {
            if (canceled) return
            onError(error)
            if (
                ['A tag with this name already exists here.', 'Tag names cannot contain'].some((message) =>
                    errorText(error).includes(message)
                )
            ) {
                // A rejected name should not block appearance changes or trap the app on quit.
                delete changes.text
                if (current.id) {
                    pending = { ...changes, ...pending }
                    if (Object.keys(pending).length) await flush(save)
                } else {
                    current = { ...current, ...changes }
                }
                return
            }
            pending = { ...changes, ...pending }
            throw error
        }
    }

    return {
        flush,
        update: (changes: TagChanges) => {
            pending = { ...pending, ...changes }
        },
        cancel: () => {
            canceled = true
            pending = {}
        },
    }
}
