import { IconLib, View } from '@fold-ui/core'
import { addDays, isSameDay, startOfDay } from 'date-fns'
import { useMemo } from 'react'
import { scheduleStamp } from '@/helpers/task-schedule'
import type { CalendarEvent } from './calendar-event'

const minutes = (date: Date) => date.getHours() * 60 + date.getMinutes()
const time = (date: Date) => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const lines = Array.from({ length: 96 }, (_, index) => ({
    top: (index * 100) / 96 + '%',
    height: 100 / 96 + '%',
    highlighted: index % 4 === 0,
    hour: Math.floor(index / 4),
}))

// Overlapping events share the day in columns. Each event expands into vacant columns to its right.
const dayColumns = (day: Date, events: CalendarEvent[]) => {
    const start = startOfDay(day)
    const end = addDays(start, 1)
    const entries = events
        .filter((event) => event.start < end && event.end > start)
        .map((event) => ({
            event,
            start: event.start <= start ? 0 : minutes(event.start),
            end: event.end >= end ? 1440 : minutes(event.end),
        }))
        .sort((a, b) => a.start - b.start || a.end - b.end)
    const groups: (typeof entries)[][] = []
    let columns: (typeof entries)[] = []
    let lastEnd = -1

    for (const entry of entries) {
        if (entry.start >= lastEnd) {
            columns = []
            groups.push(columns)
        }
        let column = columns.find((column) => column[column.length - 1].end <= entry.start)
        if (!column) {
            column = []
            columns.push(column)
        }
        column.push(entry)
        lastEnd = Math.max(lastEnd, entry.end)
    }

    return groups.flatMap((columns) =>
        columns.flatMap((column, index) =>
            column.map((entry) => {
                let span = 1
                for (const next of columns.slice(index + 1)) {
                    if (next.some((other) => other.start < entry.end && entry.start < other.end)) break
                    span++
                }
                return {
                    event: entry.event,
                    style: {
                        top: (entry.start * 100) / 1440 + '%',
                        height: (Math.max(15, entry.end - entry.start) * 100) / 1440 + '%',
                        width: (95 * span) / columns.length + '%',
                        left: 2.5 + (95 * index) / columns.length + '%',
                        zIndex: index + 1,
                    },
                }
            })
        )
    )
}

export const CalendarSchedule = ({ days, events, eventProps }) => {
    const columns = useMemo(() => days.map((day) => dayColumns(day, events)), [days, events])
    const now = new Date()

    return (
        <View className="f-calendar-schedule f-col can-update">
            <div className="f-calendar-schedule__main f-row">
                <div className="f-calendar-schedule-gutter">
                    {lines
                        .filter((line) => line.highlighted)
                        .map(({ top, height, hour }) => (
                            <div
                                key={hour}
                                style={{ top, height }}
                                className="f-calendar-schedule-gutter__line is-highlighted f-row">
                                <span className="f-calendar-schedule-gutter__time f-ellipsis">
                                    {hour % 12 || 12} {hour < 12 ? 'am' : 'pm'}
                                </span>
                            </div>
                        ))}
                </div>
                {days.map((day, index) => (
                    <div
                        key={+day}
                        data-calendar-day={scheduleStamp(day, true)}
                        data-timed
                        className="f-calendar-schedule-day">
                        {lines.map(({ top, height, highlighted }, i) => (
                            <div
                                key={i}
                                style={{ top, height }}
                                className={'f-calendar-schedule-segment' + (highlighted ? ' is-highlighted' : '')}
                            />
                        ))}
                        {columns[index].map(({ event, style }) => (
                            <div
                                key={event.id}
                                className="f-calendar-schedule-event"
                                style={style}>
                                <button
                                    {...eventProps(event)}
                                    className="f-calendar-schedule-event__inner">
                                    <span className="f-calendar-schedule-event__title f-ellipsis">{event.title}</span>
                                    <span className="f-calendar-schedule-event__date f-row">
                                        <IconLib
                                            icon="time"
                                            size="xs"
                                        />
                                        {time(event.start)}
                                        {event.task.schedule.end && ' - ' + time(event.end)}
                                    </span>
                                </button>
                            </div>
                        ))}
                        {isSameDay(day, now) && (
                            <div
                                className="f-calendar-schedule-day__today-line"
                                style={{ top: (minutes(now) * 100) / 1440 + '%' }}>
                                {days.length === 1 && (
                                    <span className="f-calendar-schedule-day__today-time f-text sm">{time(now)}</span>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </View>
    )
}
