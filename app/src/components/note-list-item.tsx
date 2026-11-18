import { IconLib, MenuContext, Progress, Text, View, classNames } from '@fold-ui/core'
import { useAppStore } from '@/store/app'
import type { Note } from '@/types'
import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { imageSource } from '@/helpers/note-files'

export const NoteListItem = ({
    note,
    isOpen,
    onOpen,
}: {
    note: Note
    isOpen: boolean
    onOpen(event: MouseEvent | KeyboardEvent): void
}) => {
    const tags = useAppStore((state) => state.tags)
    const actions = useAppStore((state) => state.actions)
    const labels = tags.filter((tag) => note.tagIds.includes(tag.id))
    const date = new Date(note.updatedAt)
    const today = date.toDateString() === new Date().toDateString()
    const hasChecklist = !note.encrypted && note.checklistTotal > 0
    const [showProgress, setShowProgress] = useState(hasChecklist)

    const handleContextMenu = (event: MouseEvent) => {
        if (event.ctrlKey) {
            // Preserve Ctrl-click selection before MenuContext handles the native event.
            event.preventDefault()
            event.stopPropagation()
            onOpen(event)
            return
        }

        actions.select(note.id)
    }

    useEffect(() => {
        if (!hasChecklist) {
            setShowProgress(false)
            return
        }
        const timer = setTimeout(() => setShowProgress(true), 200)
        return () => clearTimeout(timer)
    }, [hasChecklist])

    return (
        <MenuContext
            data={{ id: note.id }}
            row
            className={classNames({ 'note-list-item': true, 'is-open': isOpen })}
            alignItems="flex-start"
            colorToken="text"
            onClick={onOpen}
            onContextMenuCapture={handleContextMenu}
            role="button"
            tabIndex={0}
            aria-pressed={isOpen}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpen(event)
                }
            }}>
            <View
                column
                flex={1}
                gap="0.45rem"
                alignItems="flex-start"
                style={{ minWidth: 0 }}>
                <View
                    row
                    width="100%"
                    gap={8}
                    justifyContent="flex-start">
                    <Text
                        className="note-list-item__text clamp-text-one"
                        fontWeight={600}
                        flex={1}>
                        {note.title.trim() || 'Untitled note'}
                    </Text>
                    {note.pinned && (
                        <IconLib
                            icon="pin"
                            size="xs"
                            color="var(--f-color-text-weaker)"
                        />
                    )}
                </View>
                {note.encrypted ? (
                    <View
                        column
                        alignItems="flex-start"
                        width="100%"
                        gap={8}
                        p="4px 0"
                        aria-label="Encrypted content">
                        <View
                            width="92%"
                            height={8}
                            radius="var(--f-radius)"
                            bgToken="surface-stronger"
                            aria-hidden
                        />
                        <View
                            width="68%"
                            height={8}
                            radius="var(--f-radius)"
                            bgToken="surface-stronger"
                            aria-hidden
                        />
                    </View>
                ) : (
                    <Text
                        className="clamp-text-two"
                        size="sm"
                        colorToken="text-weaker">
                        {note.text.trim() || 'No additional text'}
                    </Text>
                )}
                {!note.encrypted && note.images.length > 0 && (
                    <View
                        row
                        gap={6}
                        width="100%"
                        justifyContent="flex-start"
                        className="note-image-preview"
                        aria-label={`${note.images.length} images`}>
                        {note.images.slice(0, 4).map((file) => (
                            <img
                                key={file}
                                src={imageSource(file)}
                                alt=""
                                loading="lazy"
                                draggable={false}
                            />
                        ))}
                        {note.images.length > 4 && (
                            <Text
                                size="xs"
                                colorToken="text-weaker">
                                +{note.images.length - 4}
                            </Text>
                        )}
                    </View>
                )}
                <View
                    row
                    width="100%"
                    gap={8}
                    justifyContent="flex-start"
                    m="3px 0 0">
                    <Text
                        size="xs"
                        colorToken="text-weakest"
                        shrink={0}>
                        {today
                            ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : date.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </Text>
                    {note.encrypted && (
                        <IconLib
                            icon="lock"
                            size="xs"
                            color="var(--f-color-text-weaker)"
                            aria-label="Encrypted note"
                        />
                    )}
                    <View
                        row
                        gap={8}
                        className="note-list-tags"
                        justifyContent="flex-start">
                        {labels.slice(0, 2).map((tag) => (
                            <Text
                                key={tag.id}
                                as="span"
                                size="xs"
                                className="note-list-tag f-ellipsis"
                                color={tag.color || 'var(--f-color-text-weak)'}
                                title={`#${tag.text}`}>
                                #{tag.text}
                            </Text>
                        ))}
                        {labels.length > 2 && (
                            <Text
                                size="xs"
                                shrink={0}
                                colorToken="text-weaker">
                                +{labels.length - 2}
                            </Text>
                        )}
                    </View>
                </View>
                {hasChecklist && showProgress && (
                    <Progress
                        className="note-checklist-progress"
                        thickness={3}
                        value={Math.round((note.checklistChecked / note.checklistTotal) * 100)}
                        aria-label={`${note.checklistChecked} of ${note.checklistTotal} tasks completed`}
                    />
                )}
            </View>
        </MenuContext>
    )
}
