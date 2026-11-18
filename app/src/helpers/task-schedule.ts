import { format } from 'date-fns'
import { RRule, type Options } from 'rrule'

export type TaskRepeat = {
    frequency: 'day' | 'week' | 'weekday' | 'month' | 'monthday' | 'monthweek' | 'year'
    interval: number
    weekday?: number[]
    count?: number
    to?: string
}

export type TaskSchedule = {
    id?: string
    start: string
    end?: string
    wholeDay: boolean
    repeat?: TaskRepeat
}

export type ScheduledTask = {
    index: number
    text: string
    schedule: TaskSchedule
}

const frequencies = {
    day: RRule.DAILY,
    week: RRule.WEEKLY,
    weekday: RRule.WEEKLY,
    month: RRule.MONTHLY,
    monthday: RRule.MONTHLY,
    monthweek: RRule.MONTHLY,
    year: RRule.YEARLY,
}
const weekdays = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA]

export const scheduleDate = (date: string) => new Date(date.length === 10 ? date + 'T00:00:00' : date)
export const scheduleStamp = (date: Date, wholeDay = false) =>
    format(date, wholeDay ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ss")

// RRULE operates on UTC components. Using wall-clock components here keeps local times fixed across DST.
const wallTime = (date: string) => new Date((date.length === 10 ? date + 'T00:00:00' : date) + 'Z')
const wallStamp = (date: Date, wholeDay: boolean) => date.toISOString().slice(0, wholeDay ? 10 : 19)
const validStamp = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?$/.test(value)) return false

    const date = wallTime(value)
    return Number.isFinite(date.getTime()) && wallStamp(date, value.length === 10) === value
}

export const readSchedule = (raw?: string | null, dueDate?: string | null): TaskSchedule | null => {
    if (raw) {
        try {
            const value: TaskSchedule = JSON.parse(raw)
            const repeat = value?.repeat
            if (!validStamp(value?.start) || typeof value.wholeDay !== 'boolean') return null
            if (value.end && (!validStamp(value.end) || value.end < value.start)) return null
            if (
                repeat &&
                (!Object.hasOwn(frequencies, repeat.frequency) ||
                    !Number.isInteger(repeat.interval) ||
                    repeat.interval < 1 ||
                    (repeat.frequency === 'monthday' && repeat.interval > 31) ||
                    (repeat.frequency === 'monthweek' && repeat.interval > 5) ||
                    (repeat.to && !validStamp(repeat.to)) ||
                    (repeat.count != null && (!Number.isInteger(repeat.count) || repeat.count < 1)) ||
                    (repeat.frequency === 'weekday' &&
                        (!Array.isArray(repeat.weekday) ||
                            !repeat.weekday.length ||
                            repeat.weekday.some((day) => !Number.isInteger(day) || day < 0 || day > 6))))
            )
                return null

            return value
        } catch {
            return null
        }
    }

    return validStamp(dueDate) && dueDate.length === 10 ? { start: dueDate, wholeDay: true } : null
}

export const repeatRule = (repeat: TaskRepeat, start: string) => {
    const dtstart = wallTime(start)
    const { frequency, interval, count, to } = repeat
    const options: Partial<Options> = {
        freq: frequencies[frequency],
        interval,
        dtstart,
        count,
        until: to ? wallTime(to) : null,
    }

    if (frequency === 'weekday') options.byweekday = (repeat.weekday || []).map((day) => weekdays[day])
    if (frequency === 'monthday' || frequency === 'monthweek') {
        options.interval = 1
        if (frequency === 'monthday') options.bymonthday = interval
        else options.byweekday = weekdays[dtstart.getUTCDay()].nth(interval)
    }

    return new RRule(options, true)
}

export const scheduleOccurrences = (schedule: TaskSchedule, first: Date, last: Date) => {
    const start = wallTime(schedule.start)
    const duration = schedule.end
        ? wallTime(schedule.end).getTime() - start.getTime()
        : schedule.wholeDay
        ? 0
        : 30 * 60000
    const from = new Date(wallTime(scheduleStamp(first)).getTime() - duration)
    const until = wallTime(scheduleStamp(last))
    const dates = start >= from && start <= until ? [start] : []

    if (schedule.repeat && start <= until) {
        const rule = repeatRule(schedule.repeat, schedule.start)
        // The selected start is the first occurrence even if its weekday is outside the rule.
        const count = rule.options.count ?? 0
        const extraStart = count > 0 && rule.after(start, true)?.getTime() !== start.getTime()
        if (!extraStart || count > 1) {
            const series = extraStart ? new RRule({ ...rule.origOptions, count: count - 1 }, true) : rule
            dates.push(...series.between(from, until, true).filter((date) => date.getTime() !== start.getTime()))
        }
    }

    return dates.map((date) => {
        const start = scheduleDate(wallStamp(date, schedule.wholeDay))
        const end = schedule.end
            ? scheduleDate(wallStamp(new Date(date.getTime() + duration), schedule.wholeDay))
            : new Date(start.getTime() + duration)
        return { start, end }
    })
}

// Walk back from the drop by occurrence count. RRULE skips months without the requested day or nth weekday.
const monthlySeriesStart = (repeat: TaskRepeat, start: string, before: Date, after: Date, shifted: Date) => {
    const original = wallTime(start)
    const dates = repeatRule(repeat, start).between(original, before, true)
    const separateStart = dates.length > 0 && dates[0].getTime() !== original.getTime()
    let earlier = separateStart ? dates.length : dates.length - 1
    let month = after.getUTCMonth()
    const first = new Date(after)
    const candidate = new Date(after)

    while (earlier > 0) {
        month -= repeat.frequency === 'month' ? repeat.interval : 1
        candidate.setUTCFullYear(after.getUTCFullYear(), month, 1)
        let day = after.getUTCDate()
        if (repeat.frequency === 'monthweek') {
            const weekdayOffset = (after.getUTCDay() - candidate.getUTCDay() + 7) % 7
            day = 1 + weekdayOffset + 7 * Math.floor((day - 1) / 7)
        }

        candidate.setUTCDate(day)
        if (candidate.getUTCDate() !== day) continue

        // A start outside the rule counts once, before the first matching occurrence.
        if (earlier === 1 && separateStart && shifted >= candidate && shifted < first) return shifted

        first.setTime(candidate.getTime())
        earlier--
    }

    return first
}

export const movedSchedule = (
    schedule: TaskSchedule,
    occurrence: Date,
    start: Date,
    end: Date,
    wholeDay: boolean,
    resized: boolean
): TaskSchedule => {
    const before = wallTime(scheduleStamp(occurrence))
    const after = wallTime(scheduleStamp(start, wholeDay))
    const shift = after.getTime() - before.getTime()
    let base = new Date(wallTime(schedule.start).getTime() + shift)
    const duration = wallTime(scheduleStamp(end, wholeDay)).getTime() - after.getTime()
    let repeat = schedule.repeat

    if (repeat && shift) {
        const days =
            (Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate()) -
                Date.UTC(before.getUTCFullYear(), before.getUTCMonth(), before.getUTCDate())) /
            86400000
        repeat = { ...repeat }

        if (days && ['month', 'monthday', 'monthweek'].includes(repeat.frequency))
            base = monthlySeriesStart(repeat, schedule.start, before, after, base)

        if (repeat.to) repeat.to = wallStamp(new Date(wallTime(repeat.to).getTime() + days * 86400000), false)
        if (days && repeat.frequency === 'weekday')
            repeat.weekday = (repeat.weekday || []).map((day) => (((day + days) % 7) + 7) % 7)
        if (days && repeat.frequency === 'monthday') repeat.interval = after.getUTCDate()
        if (days && repeat.frequency === 'monthweek') repeat.interval = Math.ceil(after.getUTCDate() / 7)
    }

    return {
        id: schedule.id || crypto.randomUUID(),
        start: wallStamp(base, wholeDay),
        end:
            (schedule.end || resized || schedule.wholeDay !== wholeDay) && (!wholeDay || duration > 0)
                ? wallStamp(new Date(base.getTime() + duration), wholeDay)
                : undefined,
        wholeDay,
        repeat,
    }
}
