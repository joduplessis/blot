import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useWindowEvent } from '@fold-ui/core'
import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns'
import { scheduleDate, type ScheduledTask } from '@/helpers/task-schedule'

export type CalendarEvent = {
    id: string
    noteId: string
    body: string
    task: ScheduledTask
    title: string
    start: Date
    end: Date
    wholeDay: boolean
}

type Drag = {
    event: CalendarEvent
    x: number
    y: number
    dayOffset: number
    minutesOffset: number
    edge?: 'start' | 'end'
    moved: boolean
    preview?: CalendarEvent
}

const slotMinutes = (y: number, box: DOMRect) =>
    Math.min(95, Math.max(0, Math.floor(((y - box.top) / box.height) * 96))) * 15

export const useCalendarDrag = (onUpdate: (event: CalendarEvent, preview: CalendarEvent, resized: boolean) => void) => {
    const drag = useRef<Drag | null>(null)
    const suppressClick = useRef(false)
    const [preview, setPreview] = useState<CalendarEvent | null>(null)

    const begin = (e: ReactPointerEvent<HTMLElement>, event: CalendarEvent) => {
        if (e.button !== 0) return

        const element = e.currentTarget
        const column = element.closest<HTMLElement>('[data-calendar-day]')
        const box = element.getBoundingClientRect()
        const timed = column.hasAttribute('data-timed')
        const day = scheduleDate(column.dataset.calendarDay)
        const offset = differenceInCalendarDays(day, event.start)
        const distance = timed ? e.clientY - box.top : e.clientX - box.left
        const size = timed ? box.height : box.width
        const handle = Math.min(size / 4, 8)
        const edge =
            timed || event.wholeDay
                ? distance < handle
                    ? 'start'
                    : distance > size - handle
                    ? 'end'
                    : undefined
                : undefined

        suppressClick.current = false
        drag.current = {
            event,
            x: e.clientX,
            y: e.clientY,
            moved: false,
            edge,
            dayOffset: offset + (timed ? 0 : Math.floor(distance / column.offsetWidth)),
            minutesOffset: timed
                ? slotMinutes(e.clientY, column.getBoundingClientRect()) -
                  event.start.getHours() * 60 -
                  event.start.getMinutes()
                : 0,
        }
    }

    const cancel = () => {
        if (!drag.current) return

        suppressClick.current = drag.current.moved
        drag.current = null
        setPreview(null)
    }

    const move = (e: PointerEvent) => {
        const current = drag.current
        if (!current || (!current.moved && Math.hypot(e.clientX - current.x, e.clientY - current.y) < 4)) return

        current.moved = true
        const clearPreview = () => {
            current.preview = null
            setPreview(null)
        }
        const column = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-calendar-day]')
        if (!column) return clearPreview()

        const { event, edge } = current
        const timed = column.hasAttribute('data-timed')
        const day = scheduleDate(column.dataset.calendarDay)
        const box = column.getBoundingClientRect()
        // A month event can extend across the neighboring columns.
        if (!timed) day.setDate(day.getDate() + Math.floor((e.clientX - box.left) / box.width))
        const at = new Date(day)
        at.setMinutes(slotMinutes(e.clientY, box))
        const wholeDay = timed ? false : column.dataset.allDay === 'true' || event.wholeDay
        let start = event.start
        let end = event.end

        if (edge) {
            if (wholeDay !== event.wholeDay) return clearPreview()
            if (edge === 'start') start = timed ? at : day
            else {
                end = timed ? new Date(at.getTime() + 15 * 60000) : day
            }
            if (end < start || (!wholeDay && +start === +end)) return clearPreview()
        } else if (timed) {
            start = addDays(at, -current.dayOffset)
            start.setMinutes(start.getMinutes() - current.minutesOffset, event.start.getSeconds())
            if (event.wholeDay) {
                const days = differenceInCalendarDays(event.end, event.start)
                end = days ? addDays(startOfDay(start), days + 1) : new Date(+start + 3600000)
            } else {
                end = new Date(+start + (+event.end - +event.start))
            }
        } else {
            const shift = differenceInCalendarDays(day, event.start) - current.dayOffset
            start = addDays(event.start, shift)
            end = addDays(event.end, shift)
            if (wholeDay) {
                start = startOfDay(start)
                end = startOfDay(event.wholeDay ? end : new Date(+end - 1))
            }
        }

        if (
            +current.preview?.start === +start &&
            +current.preview?.end === +end &&
            current.preview?.wholeDay === wholeDay
        )
            return
        current.preview = { ...event, start, end, wholeDay }
        setPreview(current.preview)
    }

    useWindowEvent('pointermove', move)
    useWindowEvent('pointerup', (e) => {
        if (drag.current?.moved) move(e)
        const current = drag.current
        if (current?.moved && current.preview) {
            const { event, preview } = current
            if (+event.start !== +preview.start || +event.end !== +preview.end || event.wholeDay !== preview.wholeDay)
                onUpdate(event, preview, !!current.edge)
        }
        cancel()
    })
    useWindowEvent('pointercancel', cancel)
    useWindowEvent('blur', cancel)
    useWindowEvent('keydown', (event) => {
        if (event.key === 'Escape') cancel()
    })

    return { begin, preview, suppressClick }
}
