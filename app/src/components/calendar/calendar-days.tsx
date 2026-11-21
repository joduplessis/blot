import { View, classNames, useResize } from '@fold-ui/core'
import { differenceInCalendarDays, isSameDay, isSameMonth } from 'date-fns'
import { useMemo, useRef, useState } from 'react'
import { scheduleStamp } from '@/helpers/task-schedule'
import type { CalendarEvent } from './calendar-event'

// A multi-day event occupies the same row throughout the week.
const weekMatrix = (days: Date[], events: CalendarEvent[]) => {
    const rows: CalendarEvent[][] = []
    const spans = events
        .map((event) => {
            const last = event.wholeDay ? event.end : new Date(+event.end - 1)
            return {
                event,
                first: Math.max(0, differenceInCalendarDays(event.start, days[0])),
                last: Math.min(days.length - 1, differenceInCalendarDays(last, days[0])),
            }
        })
        .filter(({ first, last }) => first <= last)
        .sort((a, b) => b.last - b.first - (a.last - a.first) || +a.event.start - +b.event.start)

    for (const { event, first, last } of spans) {
        let row = rows.find((row) => !row.slice(first, last + 1).some(Boolean))
        if (!row) {
            row = Array(days.length).fill(null)
            rows.push(row)
        }
        row.fill(event, first, last + 1)
    }
    return rows
}

const CalendarDaysDay = ({ day, date, index, firstWeek, rows, noClamp, hideDateLabels, eventProps }) => {
    const [element, setElement] = useState<HTMLDivElement | null>(null)
    const titleRef = useRef<HTMLDivElement>(null)
    const dimensions = useResize(element)
    const [expanded, setExpanded] = useState(false)
    const limit = noClamp
        ? rows.length
        : Math.max(0, Math.floor((dimensions.height - (titleRef.current?.offsetHeight || 0)) / 25))
    const hidden = rows.slice(Math.max(limit - 1, 0)).filter((row) => row[index]).length
    const overflow = !noClamp && rows.slice(limit).some((row) => row[index])
    const visible = noClamp || expanded ? rows : rows.slice(0, overflow ? Math.max(limit - 1, 0) : limit)
    const monthName =
        day.getDate() === 1 || (firstWeek && index === 0) ? day.toLocaleString(undefined, { month: 'long' }) : ''
    return (
        <div
            ref={setElement}
            className={classNames({
                'f-calendar-days-day': true,
                'is-outside-month': !isSameMonth(day, date),
                'is-expanded': expanded,
                'is-clamped': !noClamp,
            })}
            data-calendar-day={scheduleStamp(day, true)}
            data-all-day={noClamp}
            style={{ zIndex: expanded ? 11 : 10 - index }}>
            <div className="f-calendar-days-day__inner">
                {!hideDateLabels && (
                    <div
                        ref={titleRef}
                        className={classNames({
                            'f-calendar-days-day__title f-row': true,
                            'is-today': isSameDay(day, new Date()),
                        })}>
                        <span className="f-text sm">
                            {monthName} {day.getDate()}
                        </span>
                    </div>
                )}
                {visible.map((row, i) => {
                    const event: CalendarEvent = row[index]
                    if (!event || (!expanded && row[index - 1] === event))
                        return (
                            <div
                                key={i}
                                className="f-calendar-days-event__spacer"
                            />
                        )
                    const size = expanded ? 1 : row.slice(index).filter((entry) => entry === event).length
                    return (
                        <div
                            key={event.id}
                            className={classNames({
                                'f-calendar-days-event f-row is-first': true,
                                'is-all-day': event.wholeDay,
                                'is-cross-day': size > 1,
                            })}
                            style={{ width: 'calc(' + 100 * size + '% + ' + (size - 1) + 'px)' }}>
                            <button
                                {...eventProps(event)}
                                className={classNames({
                                    'f-calendar-days-event-component f-row': true,
                                    'is-time': !event.wholeDay,
                                    'is-start': isSameDay(day, event.start),
                                    'is-end': differenceInCalendarDays(event.end, day) < size,
                                })}>
                                <span className="f-calendar-days-event-component__title f-ellipsis">{event.title}</span>
                                {!event.wholeDay && (
                                    <span className="f-calendar-days-event-component__date">
                                        {event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </button>
                        </div>
                    )
                })}
                {overflow && (
                    <button
                        className="f-calendar-days-day__showmore f-buttonize f-row"
                        onClick={() => setExpanded(!expanded)}>
                        <span>{expanded ? 'Show less' : 'Show ' + hidden + ' more'}</span>
                    </button>
                )}
            </div>
        </div>
    )
}

export const CalendarDays = ({ weeks, date, events, noClamp = false, hideDateLabels = false, eventProps }) => {
    const matrix = useMemo(() => weeks.map((days) => weekMatrix(days, events)), [weeks, events])
    return (
        <View
            className="f-calendar-days f-col can-update"
            height={noClamp ? 'fit-content' : '300%'}>
            <div className="f-calendar-days__main f-col">
                {weeks.map((days, weekIndex) => (
                    <div
                        key={+days[0]}
                        className="f-calendar-days__row f-row">
                        {days.map((day, index) => (
                            <CalendarDaysDay
                                key={+day}
                                day={day}
                                date={date}
                                index={index}
                                firstWeek={weekIndex === weeks.length / 3}
                                rows={matrix[weekIndex]}
                                noClamp={noClamp}
                                hideDateLabels={hideDateLabels}
                                eventProps={eventProps}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </View>
    )
}
