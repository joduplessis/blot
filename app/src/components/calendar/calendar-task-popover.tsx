import { Button, IconButton, Input, View } from '@fold-ui/core'
import { useRef, useState } from 'react'
import { isCalendarNote } from '@/helpers/checklist'
import { scheduleStamp, type TaskSchedule, type TaskSource } from '@/helpers/task-schedule'
import { useAppStore } from '@/store/app'
import { AnchoredPopover } from '../common/anchored-popover'
import { DateSelect } from '../common/date-select'

export const CalendarTaskPopover = ({
    target,
    event,
    date,
    onDismiss,
}: {
    target: HTMLElement
    event?: TaskSource
    date: Date
    onDismiss: () => void
}) => {
    const actions = useAppStore((state) => state.actions)
    const [source, setSource] = useState(event)
    const [draftTitle, setDraftTitle] = useState('')
    const [draftSchedule, setDraftSchedule] = useState<TaskSchedule>(() => ({
        start: scheduleStamp(date, true),
        wholeDay: true,
    }))
    const [picker, setPicker] = useState<HTMLButtonElement | null>(null)
    const [creating, setCreating] = useState(false)
    const titleInput = useRef<HTMLInputElement>(null)

    const title = source?.task.text ?? draftTitle
    const schedule = source?.task.schedule ?? draftSchedule

    const rename = (value: string) => {
        if (!source) return setDraftTitle(value)

        const updated = actions.updateTask(source, source.task.schedule, value)
        if (!updated) return onDismiss()

        setSource(updated)
    }

    const closePicker = () => {
        setPicker(null)
        titleInput.current?.focus({ preventScroll: true })
    }

    const saveSchedule = (value: TaskSchedule | null) => {
        closePicker()

        if (source) {
            actions.updateTask(source, value)
            onDismiss()
        } else if (value) {
            setDraftSchedule(value)
        }
    }

    const submit = async () => {
        if (source) return onDismiss()
        if (!title.trim() || creating) return

        setCreating(true)
        try {
            await actions.createTask(title, schedule)
            onDismiss()
        } catch (error) {
            actions.setError(error)
            setCreating(false)
        }
    }

    return (
        <>
            <AnchoredPopover
                target={target}
                initialFocus={titleInput}
                role="dialog"
                aria-label={event ? 'Edit task' : 'New task'}
                width="min(360px, 90vw)"
                ignoreContainers={['task-schedule-popover']}
                onDismiss={onDismiss}
                content={
                    <View
                        row
                        gap={6}
                        p={8}>
                        <Input
                            ref={titleInput}
                            flex={1}
                            width="100%"
                            size="sm"
                            aria-label="Task title"
                            placeholder="Task title"
                            value={title}
                            onChange={(e) => rename(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit()
                            }}
                        />
                        <IconButton
                            id="calendar-task-date"
                            icon="calendar"
                            size="sm"
                            subtle
                            aria-label="Edit task schedule"
                            aria-description={schedule.start}
                            onClick={(e) => setPicker(e.currentTarget)}
                        />
                        {!event && (
                            <Button
                                size="sm"
                                disabled={!title.trim() || creating}
                                onClick={submit}>
                                Add
                            </Button>
                        )}
                    </View>
                }
            />
            {picker && (
                <AnchoredPopover
                    id="task-schedule-popover"
                    target={picker}
                    role="dialog"
                    aria-label="Task schedule"
                    width="fit-content"
                    onDismiss={() => setPicker(null)}
                    content={
                        <DateSelect
                            schedule={schedule}
                            clearLabel={!event ? null : isCalendarNote(event.noteId) ? 'Complete task' : 'Clear'}
                            onSave={saveSchedule}
                            onCancel={closePicker}
                        />
                    }
                />
            )}
        </>
    )
}
