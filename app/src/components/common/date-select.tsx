import {
    Button,
    DatePickerProvider,
    Flexer,
    Heading,
    IconLib,
    Input,
    InputControl,
    InputPopover,
    InputSuffix,
    Label,
    Link,
    Popover,
    ScrollingDatePicker,
    TimePicker,
    Toggle,
    View,
    sameDay,
    useCheck,
    useVisibility,
} from '@fold-ui/core'
import {
    addDays,
    addMonths,
    addYears,
    endOfDay,
    endOfMonth,
    endOfYear,
    nextMonday,
    startOfDay,
    startOfMonth,
    startOfYear,
} from 'date-fns'
import { useMemo, useRef, useState } from 'react'
import { repeatRule, scheduleDate, scheduleStamp, type TaskSchedule } from '@/helpers/task-schedule'
import { Repeat, defaultWeekdays as weekdays } from './repeat'

type DateSelectProps = {
    clearLabel?: string | null
    schedule: TaskSchedule | null
    onSave: (schedule: TaskSchedule | null) => void
    onCancel: () => void
}

const presets = [
    { preset: 'today', label: 'Today' },
    { preset: 'tomorrow', label: 'Tomorrow' },
    { preset: 'later-this-week', label: 'Later this week' },
    { preset: 'this-weekend', label: 'This weekend' },
    { preset: 'next-week', label: 'Next week' },
    { preset: 'in-two-weeks', label: 'In two weeks' },
    { preset: 'end-of-month', label: 'End of this month' },
    { preset: 'next-month', label: 'Next month' },
    { preset: 'in-three-months', label: 'In three months' },
    { preset: 'end-of-year', label: 'End of year' },
    { preset: 'next-year', label: 'Next year' },
]
const getDateSelectTimeFormat = (date?: Date) =>
    date?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '--'

const TimeField = ({ label, value, disabled, onChange }) => (
    <>
        <Heading
            as="h6"
            fontWeight="var(--f-font-weight-medium)"
            colorToken="accent">
            {label}
        </Heading>
        <InputPopover
            content={
                <View p={20}>
                    <TimePicker
                        autoFocus
                        showAmPm={false}
                        minutesDivider={1}
                        showSeconds={false}
                        height={200}
                        date={value ? new Date(value) : undefined}
                        onChange={onChange}
                    />
                </View>
            }>
            <InputControl width={150}>
                <Input
                    aria-label={label}
                    disabled={disabled}
                    readOnly
                    style={{ cursor: 'pointer' }}
                    value={disabled ? '--' : getDateSelectTimeFormat(value)}
                />
                <InputSuffix>
                    <IconLib
                        icon="time"
                        style={{ pointerEvents: 'none' }}
                    />
                </InputSuffix>
            </InputControl>
        </InputPopover>
    </>
)

export const DateSelect = ({ schedule, onSave, onCancel, clearLabel = 'Clear' }: DateSelectProps) => {
    const { visible, show, hide } = useVisibility(false)
    const propStart = schedule ? scheduleDate(schedule.start) : undefined
    const propEnd = schedule?.end ? scheduleDate(schedule.end) : undefined
    const initialIsRange =
        !!propStart &&
        !!propEnd &&
        (schedule?.wholeDay ? !sameDay(propStart, propEnd) : propStart.getTime() !== propEnd.getTime())
    const dateRange = useCheck(initialIsRange)
    const wholeDay = useCheck(schedule?.wholeDay ?? true)
    const [start, setStart] = useState(propStart)
    const [end, setEnd] = useState(propEnd)
    const [repeat, setRepeat] = useState(schedule?.repeat)
    const repeatBeforeEdit = useRef(repeat)
    const [selection, setSelection] = useState<any[]>(
        !!start && !!end ? [[start, end]] : !!start ? [[start, start]] : []
    )
    const [defaultDate, setDefaultDate] = useState(start || end || new Date())
    const repeatLabel = useMemo(
        () =>
            repeat && (repeat.frequency !== 'weekday' || repeat.weekday?.length)
                ? repeatRule(repeat, scheduleStamp(start || new Date())).toText()
                : 'Add repeat schedule',
        [repeat, start]
    )

    const selectPresetDate = (preset) => {
        const today = startOfDay(new Date())
        let start = today

        switch (preset) {
            case 'tomorrow':
                start = addDays(today, 1)
                break
            case 'later-this-week':
                start = addDays(today, Math.max(1, (5 - today.getDay() + 7) % 7))
                break
            case 'this-weekend':
                start = addDays(today, (6 - today.getDay() + 7) % 7)
                break
            case 'next-week':
                start = nextMonday(today)
                break
            case 'in-two-weeks':
                start = addDays(today, 14)
                break
            case 'end-of-month':
                start = startOfDay(endOfMonth(today))
                break
            case 'next-month':
                start = startOfMonth(addMonths(today, 1))
                break
            case 'in-three-months':
                start = addMonths(today, 3)
                break
            case 'end-of-year':
                start = startOfDay(endOfYear(today))
                break
            case 'next-year':
                start = startOfYear(addYears(today, 1))
                break
        }

        const isRange = preset === 'this-weekend'
        const end = endOfDay(isRange ? addDays(start, 1) : start)
        setSelection([[start, end]])
        setDefaultDate(start)
        setStart(start)
        setEnd(end)
        wholeDay.setChecked(true)
        dateRange.setChecked(isRange)
    }

    const handleRepeatShow = () => {
        repeatBeforeEdit.current = repeat
        show()
    }

    const handleRepeatCancel = () => {
        setRepeat(repeatBeforeEdit.current)
        hide()
    }

    const handleSelection = (day: Date) => {
        const withTime = (date: Date, time?: Date) => {
            const result = new Date(date)
            result.setHours(time?.getHours() || 0, time?.getMinutes() || 0, 0, 0)
            return result
        }

        if (dateRange.checked && (!selection[0] || selection[0][1])) {
            const first = withTime(day, start)
            setSelection([[first, null]])
            setStart(first)
            setEnd(withTime(day, end || start))
            return
        }

        const first = dateRange.checked ? selection[0][0] : day
        const ordered = first.toDateString() !== day.toDateString() && first > day ? [day, first] : [first, day]
        const nextStart = withTime(ordered[0], start)
        const nextEnd = withTime(ordered[1], end || start)
        setSelection([[nextStart, nextEnd]])
        setStart(nextStart)
        setEnd(nextEnd)
    }

    const handleStartDate = (date) => {
        setStart(date)
        setSelection([[date, selection[0] ? selection[0][1] : new Date()]])
    }

    const handleEndDate = (date) => {
        setEnd(date)
        setSelection([[selection[0] ? selection[0][0] : new Date(), date]])
    }

    const handleSave = () => {
        if (!start) return

        onSave({
            id: schedule?.id || crypto.randomUUID(),
            start: scheduleStamp(start, wholeDay.checked),
            end: dateRange.checked && end ? scheduleStamp(end, wholeDay.checked) : undefined,
            wholeDay: wholeDay.checked,
            repeat: repeat || undefined,
        })
    }

    const handleDateRangeCheck = () => {
        const startDate = start || new Date()
        setStart(startDate)
        setEnd(startDate)
        setSelection([[startDate, startDate]])
        dateRange.check()
    }

    return (
        <div className="f-date-select">
            <div className="f-date-select__date f-row">
                <div className="f-date-select__presets f-col f-scrollbar">
                    {presets.map(({ preset, label }) => (
                        <Link
                            key={preset}
                            size="sm"
                            className="f-underline"
                            onClick={() => selectPresetDate(preset)}>
                            {label}
                        </Link>
                    ))}
                </div>

                <div className="f-date-select__date-picker">
                    <DatePickerProvider>
                        <ScrollingDatePicker
                            height={300}
                            defaultDate={defaultDate}
                            selection={selection}
                            onChange={handleSelection}
                            monthTitle={(date: Date) => (
                                <View
                                    column
                                    colorToken="accent"
                                    as="span"
                                    width="100%">
                                    <span
                                        className="f-text sm f-date-select__month"
                                        style={{ padding: '0.5rem 0.9rem' }}>
                                        {date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                                    </span>
                                    <span
                                        className="f-row"
                                        style={{ width: '100%', paddingBottom: 4 }}>
                                        {weekdays.map((weekday, index) => (
                                            <span
                                                className="f-text sm f-date-select__weekday"
                                                key={index}>
                                                {weekday.slice(0, 2)}
                                            </span>
                                        ))}
                                    </span>
                                </View>
                            )}
                        />
                    </DatePickerProvider>
                </div>

                <div className="f-date-select__time f-col">
                    <TimeField
                        label={dateRange.checked || !wholeDay.checked ? 'Start time' : 'Due time'}
                        value={start}
                        disabled={wholeDay.checked}
                        onChange={handleStartDate}
                    />
                    {dateRange.checked && (
                        <TimeField
                            label="End time"
                            value={end || start}
                            disabled={wholeDay.checked}
                            onChange={handleEndDate}
                        />
                    )}

                    <View
                        row
                        gap={10}>
                        <Toggle
                            id="f-date-select-time"
                            onChange={wholeDay.check}
                            on={wholeDay.checked}
                        />
                        <Label htmlFor="f-date-select-time">Whole day</Label>
                    </View>

                    <Flexer />

                    <Popover
                        focusTrap
                        width="fit-content"
                        anchor="top-right"
                        content={
                            <Repeat
                                repeat={repeat}
                                start={start || new Date()}
                                onSave={(repeat) => {
                                    repeatBeforeEdit.current = repeat
                                    setRepeat(repeat)
                                    hide()
                                }}
                                onDismiss={handleRepeatCancel}
                                onChange={(repeat) => setRepeat(repeat)}
                                onClear={() => {
                                    repeatBeforeEdit.current = null
                                    setRepeat(null)
                                    hide()
                                }}
                            />
                        }
                        isVisible={visible}
                        onDismiss={(event) => {
                            if (event.key === 'Escape') event.stopPropagation()
                            handleRepeatCancel()
                        }}>
                        <div
                            className="f-row"
                            style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start' }}>
                            <Link
                                style={{ maxWidth: 150, overflowWrap: 'anywhere' }}
                                size="sm"
                                colorToken="text-weaker"
                                className="f-underline"
                                onClick={handleRepeatShow}>
                                {repeatLabel}
                            </Link>
                        </div>
                    </Popover>
                </div>
            </div>

            <div className="f-date-select__footer f-row">
                <Toggle
                    id="f-date-select-range"
                    onChange={handleDateRangeCheck}
                    on={dateRange.checked}
                />
                <Label htmlFor="f-date-select-range">Date range</Label>

                <div style={{ flex: 1 }} />

                {clearLabel && (
                    <Button
                        subtle
                        onClick={() => onSave(null)}>
                        {clearLabel}
                    </Button>
                )}

                <Button onClick={onCancel}>Cancel</Button>

                <Button
                    disabled={
                        !start ||
                        (dateRange.checked && (!selection[0]?.[1] || !end || (!wholeDay.checked && end <= start)))
                    }
                    variant="accent"
                    onClick={handleSave}>
                    Okay
                </Button>
            </div>
        </div>
    )
}
