import { Button, ButtonGroup, Flexer, Heading, IconLib, Option, Options, Text, View } from '@fold-ui/core'
import {
    addDays,
    addMonths,
    differenceInCalendarWeeks,
    endOfDay,
    startOfDay,
    startOfMonth,
    startOfWeek,
} from 'date-fns'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store/app'
import { movedSchedule, scheduleOccurrences } from '@/helpers/task-schedule'
import { isCalendarNote } from '@/helpers/checklist'
import { CalendarDays } from './calendar-days'
import { CalendarSchedule } from './calendar-schedule'
import { useCalendarDrag, type CalendarEvent } from './calendar-event'
import { CalendarTaskPopover } from './calendar-task-popover'

const useCalendarScroll = (date: Date, view: number, setDate: (date: Date) => void) => {
    const scrollRef = useRef<HTMLDivElement>(null)
    const position = useRef(1)
    const pending = useRef<{ date: Date; position: number } | null>(null)
    const month = view === 2
    const pageWeeks = month ? 6 : 1
    const weeks = useMemo(() => {
        if (view === 0) return [[date]]

        const first = addDays(startOfWeek(month ? startOfMonth(date) : date), -7 * pageWeeks)
        return Array.from({ length: 3 * pageWeeks }, (_, week) =>
            Array.from({ length: 7 }, (_, day) => addDays(first, week * 7 + day))
        )
    }, [date, view])

    const pageSize = (element: HTMLDivElement) =>
        month ? element.clientHeight : (element.scrollWidth - element.clientWidth) / 2

    const handleScroll = () => {
        const element = scrollRef.current
        if (!view || !element || pending.current) return

        const size = pageSize(element)
        if (!size) return

        const offset = month ? element.scrollTop : element.scrollLeft
        position.current = Math.max(0, Math.min(2, offset / size))
        const nextDate = month
            ? startOfMonth(weeks[Math.floor((position.current + 0.5) * pageWeeks)][3])
            : weeks[Math.round(position.current)][0]
        const shift = differenceInCalendarWeeks(nextDate, month ? startOfMonth(date) : date)
        if (!shift) return

        // Recenter the date window without moving the dates on screen.
        pending.current = { date: nextDate, position: position.current - shift / pageWeeks }
        setDate(nextDate)
    }

    useLayoutEffect(() => {
        const element = scrollRef.current
        position.current = pending.current?.date === date ? pending.current.position : 1
        pending.current = null
        if (!view) return

        const alignScroll = () => {
            const offset = position.current * pageSize(element)
            if (month) element.scrollTop = offset
            else element.scrollLeft = offset
        }

        alignScroll()
        const observer = new ResizeObserver(alignScroll)
        observer.observe(element)

        return () => observer.disconnect()
    }, [date, view])

    return { weeks, scrollRef, handleScroll }
}

export const Calendar = () => {
    const notes = useAppStore((state) => state.notes)
    const unlocked = useAppStore((state) => state.privacy.unlocked && !state.locking)
    const actions = useAppStore((state) => state.actions)
    const [editor, setEditor] = useState<{ target: HTMLButtonElement; event?: CalendarEvent } | null>(null)
    const [date, setDate] = useState(() => startOfDay(new Date()))
    const [view, setView] = useState(2)
    const month = view === 2
    const { weeks, scrollRef, handleScroll } = useCalendarScroll(date, view, setDate)
    const days = useMemo(() => weeks.flat(), [weeks])
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
                        title: isCalendarNote(note.id)
                            ? task.text.trim() || 'Untitled task'
                            : [task.text.trim(), title].filter(Boolean).join(' · '),
                        wholeDay: task.schedule.wholeDay,
                        ...range,
                    })
                }
            }
        }
        return result
    }, [notes, days, unlocked])
    const editable =
        !editor?.event ||
        notes.some((note) => note.id === editor.event.noteId && !note.trashedAt && (!note.encrypted || unlocked))
    const drag = useCalendarDrag((event, preview, resized) => {
        const schedule = movedSchedule(
            event.task.schedule,
            event.start,
            preview.start,
            preview.end,
            preview.wholeDay,
            resized
        )
        actions.updateTask(event, schedule)
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
        setDate(month ? addMonths(date, direction) : addDays(date, direction * (view === 1 ? 7 : 1)))
    const eventProps = (event: CalendarEvent) => ({
        'type': 'button' as const,
        'title': event.title + (event.task.schedule.repeat ? ' (drag to move the repeating schedule)' : ''),
        'aria-label': event.title,
        'data-event-id': event.id,
        'onPointerDown': (e) => drag.begin(e, event),
        'onClick': (e) => {
            if (e.detail && drag.suppressClick.current) return
            e.currentTarget.id ||= 'calendar-entry-' + crypto.randomUUID()
            setEditor({ target: e.currentTarget, event })
        },
    })

    useEffect(() => {
        if (!editable) setEditor(null)
    }, [editable])

    const weekdays = (
        <View
            row
            width="100%"
            shrink={0}
            className="calendar-weekdays">
            {(month ? weeks[0] : days).map((day) => (
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
    )

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
                <Button
                    id="calendar-new-task"
                    size="sm"
                    onClick={(e) => setEditor({ target: e.currentTarget })}>
                    New task
                </Button>
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
            {month && weekdays}
            <View
                key={month ? 'month' : 'schedule'}
                ref={scrollRef}
                flex={1}
                role="region"
                aria-label={['Day calendar', 'Week calendar', 'Month calendar'][view]}
                tabIndex={0}
                onScroll={handleScroll}
                className={'calendar-scroll f-scrollbar' + (view === 1 ? ' is-week' : '')}>
                {month ? (
                    <CalendarDays
                        weeks={weeks}
                        date={date}
                        events={wholeDayEvents}
                        eventProps={eventProps}
                    />
                ) : (
                    <View
                        column
                        alignItems="stretch"
                        justifyContent="flex-start"
                        width={view === 1 ? 'calc(300% - 2 * var(--f-calendar-schedule-gutter-width))' : '100%'}
                        style={{ minHeight: '100%' }}>
                        <View
                            row
                            alignItems="stretch"
                            position="sticky"
                            zIndex={1}
                            bgToken="surface"
                            style={{ top: 0 }}>
                            <View
                                width="var(--f-calendar-schedule-gutter-width)"
                                shrink={0}
                                bgToken="surface"
                                className="calendar-heading-gutter"
                            />
                            <View
                                flex={1}
                                style={{ minWidth: 0 }}>
                                {weekdays}
                                <View className="calendar-all-day">
                                    <CalendarDays
                                        noClamp
                                        hideDateLabels
                                        weeks={weeks}
                                        date={date}
                                        events={wholeDayEvents}
                                        eventProps={eventProps}
                                    />
                                </View>
                            </View>
                        </View>
                        <CalendarSchedule
                            days={days}
                            events={timedEvents}
                            eventProps={eventProps}
                        />
                    </View>
                )}
            </View>
            {editor && editable && (
                <CalendarTaskPopover
                    key={editor.target.id}
                    target={editor.target}
                    event={editor.event}
                    date={date}
                    onDismiss={() => setEditor(null)}
                />
            )}
        </View>
    )
}
