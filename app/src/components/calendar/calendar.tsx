import { Button, ButtonGroup, Flexer, Heading, IconLib, Option, Options, Text, View } from '@fold-ui/core'
import { addDays, addMonths, endOfDay, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { useMemo, useState } from 'react'
import { useAppStore } from '@/store/app'
import { movedSchedule, scheduleOccurrences } from '@/helpers/task-schedule'
import { NoteEditor } from '../note-editor'
import { CalendarDays } from './calendar-days'
import { CalendarSchedule } from './calendar-schedule'
import { useCalendarDrag, type CalendarEvent } from './calendar-event'
import { AnchoredPopover } from '../common/anchored-popover'

export const Calendar = () => {
    const notes = useAppStore((state) => state.notes)
    const unlocked = useAppStore((state) => state.privacy.unlocked && !state.locking)
    const selectedId = useAppStore((state) => state.selectedId)
    const actions = useAppStore((state) => state.actions)
    const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
    const [date, setDate] = useState(() => startOfDay(new Date()))
    const [view, setView] = useState(2)
    const month = view === 2
    const days = useMemo(() => {
        const first = month ? startOfWeek(startOfMonth(date)) : view === 1 ? startOfWeek(date) : date
        return Array.from({ length: month ? 42 : view === 1 ? 7 : 1 }, (_, i) => addDays(first, i))
    }, [date, view])
    const weeks = useMemo(
        () => (month ? Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7)) : [days]),
        [days]
    )
    const events = useMemo(() => {
        const result: CalendarEvent[] = []
        for (const note of notes) {
            if (note.trashedAt || (note.encrypted && !unlocked)) continue

            for (const task of note.scheduledTasks) {
                for (const range of scheduleOccurrences(task.schedule, days[0], endOfDay(days[days.length - 1]))) {
                    const title = note.title.trim() || 'Untitled note'
                    result.push({
                        id: [note.id, task.schedule.id || task.index, task.index, +range.start].join('/'),
                        noteId: note.id,
                        body: note.body,
                        task,
                        title: task.text ? task.text + ' · ' + title : title,
                        wholeDay: task.schedule.wholeDay,
                        ...range,
                    })
                }
            }
        }
        return result
    }, [notes, days, unlocked])
    const note = notes.find((note) => note.id === selectedId && !note.trashedAt && (!note.encrypted || unlocked))
    const drag = useCalendarDrag((event, preview, resized) => {
        const schedule = movedSchedule(
            event.task.schedule,
            event.start,
            preview.start,
            preview.end,
            preview.wholeDay,
            resized
        )
        actions.rescheduleTask(event.noteId, event.body, event.task, schedule)
    })
    const displayed = useMemo(
        () => (drag.preview ? events.map((event) => (event.id === drag.preview.id ? drag.preview : event)) : events),
        [events, drag.preview]
    )
    const wholeDayEvents = useMemo(() => {
        if (month) return displayed

        // Keep the all-day row in place while the pointer is choosing a time below it.
        const entries = drag.preview?.wholeDay ? displayed : events
        return entries.filter((event) => event.wholeDay)
    }, [displayed, events, month, drag.preview])
    const timedEvents = useMemo(() => (month ? [] : displayed.filter((event) => !event.wholeDay)), [displayed, month])
    const heading = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    const navigate = (direction: number) =>
        setDate(month ? addMonths(date, direction) : addDays(date, direction * days.length))
    const eventProps = (event: CalendarEvent) => ({
        'type': 'button' as const,
        'title': event.title + (event.task.schedule.repeat ? ' (drag to move the repeating schedule)' : ''),
        'aria-label': event.title,
        'data-event-id': event.id,
        'onPointerDown': (e) => drag.begin(e, event),
        'onClick': (e) => {
            if (e.detail && drag.suppressClick.current) return
            e.currentTarget.id ||= 'calendar-entry-' + crypto.randomUUID()
            setAnchor(e.currentTarget)
            actions.select(event.noteId)
        },
    })
    return (
        <View
            column
            flex={1}
            height="100%"
            width="100%"
            alignItems="stretch"
            justifyContent="stretch"
            bgToken="surface"
            className="frame calendar-header">
            <View
                row
                gap="1rem"
                p="0.5rem 1rem"
                height="var(--header-height)"
                shrink={0}
                className="calendar-heading">
                <Heading as="h5">{heading}</Heading>
                <Flexer />
                <ButtonGroup>
                    <Button
                        size="sm"
                        aria-label="Previous period"
                        onClick={() => navigate(-1)}>
                        <IconLib icon="chevron-left" />
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => setDate(startOfDay(new Date()))}>
                        Today
                    </Button>
                    <Button
                        size="sm"
                        aria-label="Next period"
                        onClick={() => navigate(1)}>
                        <IconLib icon="chevron-right" />
                    </Button>
                </ButtonGroup>
                <Options
                    size="sm"
                    animated
                    selected={view}
                    onOptionChange={setView}>
                    <Option>Day</Option>
                    <Option>Week</Option>
                    <Option>Month</Option>
                </Options>
            </View>
            <View
                row
                width="100%"
                shrink={0}
                p={month ? 0 : '0 0 0 var(--f-calendar-schedule-gutter-width)'}
                className="calendar-weekdays">
                {(month ? days.slice(0, 7) : days).map((day) => (
                    <Text
                        key={+day}
                        flex={1}
                        p="0.5rem"
                        fontWeight="var(--f-font-weight-bold)"
                        textAlign="center">
                        {day.toLocaleDateString(undefined, { weekday: 'short' })} {!month && day.getDate()}
                    </Text>
                ))}
            </View>
            {month ? (
                <CalendarDays
                    weeks={weeks}
                    date={date}
                    events={wholeDayEvents}
                    eventProps={eventProps}
                />
            ) : (
                <>
                    <View
                        p="0 1px 0 var(--f-calendar-schedule-gutter-width)"
                        width="100%"
                        className="calendar-all-day">
                        <CalendarDays
                            noClamp
                            hideDateLabels
                            weeks={weeks}
                            date={date}
                            events={wholeDayEvents}
                            eventProps={eventProps}
                        />
                    </View>
                    <View
                        width="100%"
                        flex={1}
                        position="relative"
                        className="calendar-timeline f-scrollbar">
                        <CalendarSchedule
                            days={days}
                            events={timedEvents}
                            eventProps={eventProps}
                        />
                    </View>
                </>
            )}
            {note && anchor && (
                <AnchoredPopover
                    target={anchor}
                    role="dialog"
                    aria-label="Edit calendar note"
                    width="min(640px, 82vw)"
                    height="min(510px, 72vh)"
                    className="calendar-note-popover"
                    ignoreContainers={['task-schedule-popover']}
                    onDismiss={() => actions.select('')}
                    content={
                        <NoteEditor
                            key={note.id}
                            note={note}
                            onDismiss={() => actions.select('')}
                        />
                    }
                />
            )}
        </View>
    )
}
