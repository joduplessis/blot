import { Button, ButtonGroup, Flexer, IconLib, Input, Text, Tooltip, View } from '@fold-ui/core'
import { useState, type CSSProperties } from 'react'
import { hasNoteFiles } from '@/helpers/note-files'
import { useAppStore } from '@/store/app'
import { DEFAULT_READING_FONT_SIZE, MIN_READING_FONT_SIZE, MAX_READING_FONT_SIZE } from '@/helpers/reading-font-size'
import { NoteButton } from './note-button'
import { Tiptap } from './tiptap'
import type { Note } from '@/types'

export const NoteEditor = ({ note, onDismiss }: { note: Note; onDismiss?: () => void }) => {
    const pinSet = useAppStore((state) => state.privacy.pinSet)
    const status = useAppStore((state) => state.status)
    const focusMode = useAppStore((state) => state.focusMode)
    const readingFontSize = useAppStore((state) => state.readingFontSize)
    const actions = useAppStore((state) => state.actions)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [formattingTarget, setFormattingTarget] = useState<HTMLDivElement | null>(null)
    const [uploadTarget, setUploadTarget] = useState<HTMLDivElement | null>(null)
    const hasFiles = hasNoteFiles(note.body)
    const words = `${note.title} ${note.text}`.trim().split(/\s+/).filter(Boolean).length

    const trash = () => {
        actions.updateNote(note.id, { trashedAt: note.trashedAt ? null : new Date().toISOString() })
        actions.select('')
    }

    const remove = async () => {
        if (!confirmDelete) return setConfirmDelete(true)
        try {
            await actions.deleteNote(note.id)
        } catch (error) {
            actions.setError(error)
        }
    }

    return (
        <View
            column
            flex={1}
            height="100%"
            alignItems="stretch"
            justifyContent="flex-start"
            className="note-editor-pane">
            <View
                row
                p={focusMode ? '0 1rem 0 100px' : '0 1rem'}
                className="note-editor-toolbar"
                height="var(--header-height)"
                shrink={0}
                gap="1rem">
                <NoteButton
                    subtle
                    round={false}
                    aria-label={onDismiss ? 'Close note' : focusMode ? 'Show sidebar' : 'Focus mode'}
                    active={focusMode}
                    onClick={onDismiss || actions.toggleFocus}>
                    <IconLib icon={onDismiss ? 'x' : 'sidebar'} />
                </NoteButton>
                <Flexer />
                {pinSet && !note.trashedAt && (
                    <Tooltip
                        anchor="bottom-center"
                        text={
                            hasFiles
                                ? 'Notes with images or attachments cannot be encrypted.'
                                : note.encrypted
                                ? 'Remove lock'
                                : 'Encrypt note'
                        }>
                        <View
                            row
                            tabIndex={hasFiles ? 0 : -1}>
                            <Button
                                round
                                square
                                size="sm"
                                disabled={hasFiles}
                                active={note.encrypted}
                                aria-pressed={note.encrypted}
                                aria-label={note.encrypted ? 'Remove lock' : 'Encrypt note'}
                                onClick={() =>
                                    actions.setNoteEncrypted(note.id, !note.encrypted).catch(actions.setError)
                                }>
                                <IconLib icon={note.encrypted ? 'lock' : 'lock-open'} />
                            </Button>
                        </View>
                    </Tooltip>
                )}
                <ButtonGroup
                    className="note-font-controls"
                    role="group"
                    aria-label="Reading font size"
                    onMouseDown={(event) => event.preventDefault()}>
                    <NoteButton
                        aria-label="Decrease reading font size"
                        disabled={readingFontSize <= MIN_READING_FONT_SIZE}
                        onClick={() => actions.setReadingFontSize(readingFontSize - 1)}>
                        <IconLib icon="font-decrease" />
                    </NoteButton>
                    <NoteButton
                        aria-label="Increase reading font size"
                        disabled={readingFontSize >= MAX_READING_FONT_SIZE}
                        onClick={() => actions.setReadingFontSize(readingFontSize + 1)}>
                        <IconLib icon="font-increase" />
                    </NoteButton>
                </ButtonGroup>
                {!note.trashedAt && !note.encrypted && (
                    <ButtonGroup
                        ref={setUploadTarget}
                        role="group"
                        aria-label="Insert files"
                    />
                )}
                {note.trashedAt ? (
                    <>
                        <Button
                            size="sm"
                            onClick={trash}>
                            Restore note
                        </Button>
                        <Button
                            subtle
                            size="sm"
                            variant="danger"
                            onClick={remove}>
                            {confirmDelete ? 'Confirm delete forever' : 'Delete forever'}
                        </Button>
                    </>
                ) : (
                    <>
                        <ButtonGroup
                            ref={setFormattingTarget}
                            role="group"
                            aria-label="Note actions">
                            <NoteButton
                                aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
                                active={note.pinned}
                                onClick={() => actions.updateNote(note.id, { pinned: !note.pinned })}>
                                <IconLib icon="pin" />
                            </NoteButton>
                        </ButtonGroup>
                        <NoteButton
                            aria-label="Move note to Trash"
                            tooltipAnchor="bottom-right"
                            onClick={trash}>
                            <IconLib icon="trash" />
                        </NoteButton>
                    </>
                )}
            </View>
            <div className="note-scroll f-scrollbar">
                <div
                    className="note-page"
                    style={{ '--note-font-scale': readingFontSize / DEFAULT_READING_FONT_SIZE } as CSSProperties}>
                    {note.trashedAt && (
                        <Text
                            size="sm"
                            colorToken="text-weaker"
                            m="0 0 24px">
                            This note is in Trash. Restore it to keep writing.
                        </Text>
                    )}
                    <Input
                        className="note-title"
                        fontWeight={650}
                        lineHeight={1.35}
                        border="none"
                        shadow="none"
                        p={0}
                        width="100%"
                        aria-label="Note title"
                        placeholder="Untitled note"
                        autoFocus={!note.title && !note.trashedAt}
                        disabled={!!note.trashedAt}
                        value={note.title}
                        onChange={(event) => actions.updateNote(note.id, { title: event.target.value })}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === 'ArrowDown') {
                                event.preventDefault()
                                document.querySelector<HTMLElement>('[aria-label="Note body"]')?.focus()
                            }
                        }}
                    />
                    <Tiptap
                        noteId={note.id}
                        content={note.body}
                        placeholder="Start writing… Use #tag to organize your note."
                        disabled={!!note.trashedAt}
                        formattingTarget={formattingTarget}
                        uploadTarget={uploadTarget}
                        onUpdate={(body, text) => actions.updateNote(note.id, { body, text })}
                    />
                </div>
            </div>
            <View
                row
                justifyContent="space-between"
                p="10px 14px"
                gap={12}
                className="note-status"
                shrink={0}>
                <Text
                    size="xs"
                    colorToken="text-weaker"
                    role="status">
                    {status === 'saved' ? 'Saved on this device' : status === 'saving' ? 'Saving…' : 'Not saved'}
                </Text>
                <Text
                    size="xs"
                    colorToken="text-weaker">
                    {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
                </Text>
            </View>
        </View>
    )
}
