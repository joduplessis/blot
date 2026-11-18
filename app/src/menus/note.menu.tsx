import { IconLib, Menu, MenuItem } from '@fold-ui/core'
import { hasNoteFiles } from '@/helpers/note-files'
import { useAppStore } from '@/store/app'

export const NoteMenu = ({ noteId, onDismiss }: { noteId: string; onDismiss(): void }) => {
    const note = useAppStore((state) => state.notes.find((note) => note.id === noteId))
    const pinSet = useAppStore((state) => state.privacy.pinSet)
    const unlocked = useAppStore((state) => state.privacy.unlocked && !state.locking)
    const actions = useAppStore((state) => state.actions)

    if (!note) return null

    const locked = note.encrypted && !unlocked
    const hasFiles = hasNoteFiles(note.body)

    return (
        <Menu
            width={180}
            shadow="none"
            aria-label="Note actions">
            {locked && (
                <MenuItem
                    prefix={<IconLib icon="lock-open" />}
                    onClick={() => {
                        actions.requestUnlock()
                        onDismiss()
                    }}>
                    Unlock Blot
                </MenuItem>
            )}
            {pinSet && !note.trashedAt && (
                <MenuItem
                    prefix={<IconLib icon={note.encrypted ? 'lock-open' : 'lock'} />}
                    disabled={hasFiles}
                    anchorProps={{ 'aria-disabled': hasFiles }}
                    onClick={() => {
                        actions.setNoteEncrypted(note.id, !note.encrypted).catch(actions.setError)
                        onDismiss()
                    }}>
                    {note.encrypted ? 'Remove lock' : 'Lock note'}
                </MenuItem>
            )}
            {!locked && !note.trashedAt && (
                <MenuItem
                    prefix={<IconLib icon="pin" />}
                    onClick={() => {
                        actions.updateNote(note.id, { pinned: !note.pinned })
                        onDismiss()
                    }}>
                    {note.pinned ? 'Unpin' : 'Pin'}
                </MenuItem>
            )}
            {!locked && (
                <MenuItem
                    prefix={<IconLib icon={note.trashedAt ? 'refresh' : 'trash'} />}
                    onClick={() => {
                        actions.updateNote(note.id, { trashedAt: note.trashedAt ? null : new Date().toISOString() })
                        onDismiss()
                    }}>
                    {note.trashedAt ? 'Restore' : 'Delete'}
                </MenuItem>
            )}
        </Menu>
    )
}
