import {
    Button,
    ButtonGroup,
    DatePicker,
    DatePickerProvider,
    Flexer,
    Footer,
    Heading,
    IconLib,
    Input,
    InputControl,
    InputNumberControl,
    InputPopover,
    InputSuffix,
    Select,
    View,
    focusInputAtEnd,
} from '@fold-ui/core'
import { useRef, useState } from 'react'
import { format } from 'date-fns'
import { scheduleDate, scheduleStamp, type TaskRepeat } from '@/helpers/task-schedule'

const RepeatNumber = ({ disabled = false, number, onNumberChange, useSuffix = false, max = 31 }) => {
    const ref = useRef(null)
    const inputValue = useSuffix && number <= 31 ? format(new Date(2000, 0, number), 'do') : String(number)

    const handleIncrease = () => {
        onNumberChange(+number + 1)
        focusInputAtEnd(ref.current)
    }

    const handleDecrease = () => {
        onNumberChange(+number - 1)
        focusInputAtEnd(ref.current)
    }

    return (
        <InputControl>
            <Input
                width={75}
                disabled={disabled}
                value={inputValue}
                size="md"
                type="text"
                readOnly
                ref={ref}
            />
            <InputSuffix>
                <InputNumberControl
                    size="md"
                    onDecrease={handleDecrease}
                    onIncrease={handleIncrease}
                    disableDecrease={+number <= 1 || disabled}
                    disableIncrease={disabled || +number >= max}
                />
            </InputSuffix>
        </InputControl>
    )
}

export const defaultWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const frequencies = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'weekday', label: 'Week on selected days' },
    { key: 'month', label: 'Month' },
    { key: 'monthday', label: 'Day of the month' },
    { key: 'monthweek', label: 'Week of the month' },
    { key: 'year', label: 'Year' },
]
const intervalLimits = { day: 6, week: 51, weekday: 31, month: 11, monthday: 31, monthweek: 5, year: 10 }

export type RepeatProps = {
    repeat?: TaskRepeat
    start: Date
    onChange: (value: TaskRepeat) => void
    onSave: (value: TaskRepeat) => void
    onClear: () => void
    onDismiss: () => void
}

export const Repeat = ({ repeat, start, onChange, onSave, onClear, onDismiss }: RepeatProps) => {
    const { interval = 1, weekday = [], frequency = 'day', count } = repeat || {}
    const to = repeat?.to ? scheduleDate(repeat.to) : undefined
    const [selected, setSelected] = useState(() => {
        if (to) return ['until']
        if (count != null) return ['times']
        return ['forever']
    })
    const fromDate = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

    const handleChange = (updates) => {
        onChange({
            ...repeat,
            interval,
            weekday,
            frequency,
            to: repeat?.to,
            count,
            ...updates,
        })
    }

    const handleCustomDayClick = (day) => {
        if (weekday.includes(day)) {
            handleChange({ weekday: weekday.filter((d) => d != day) })
        } else {
            handleChange({ weekday: [...weekday, day] })
        }
    }

    const handleSelect = (selectedFrequency, dismiss) => {
        handleChange({ frequency: selectedFrequency.key, interval: 1 })
        dismiss()
    }

    const handleRepetitionChange = (count) => {
        handleChange({ count, to: undefined })
    }

    const handleNumberChange = (interval) => {
        handleChange({ interval })
    }

    const handleDateChange = (to) => {
        // Include occurrences at any time on the selected last day.
        const endOfDay = new Date(to)
        endOfDay.setHours(23, 59, 59, 999)
        handleChange({ to: scheduleStamp(endOfDay), count: undefined })
    }

    const handleRepetitionSelect = (option, dismiss) => {
        setSelected([option.key])
        dismiss()
        if (option.key == 'times') handleChange({ to: undefined, count: count ?? 1 })
        if (option.key == 'until') handleChange({ count: undefined })
        if (option.key == 'forever') handleChange({ to: undefined, count: undefined })
    }

    const handleSave = () => onSave({ ...repeat, interval, weekday, frequency, count })

    return (
        <View
            width="fit-content"
            radius="var(--f-radius)"
            border="1px solid var(--f-color-border)">
            <View
                p="1rem"
                column
                gap="1rem"
                width="fit-content"
                alignItems="flex-start">
                <Heading
                    colorToken="accent"
                    as="h6">
                    Repeats from {fromDate}, every:
                </Heading>
                <View
                    row
                    gap={10}>
                    <View width={100}>
                        <RepeatNumber
                            useSuffix
                            number={interval}
                            onNumberChange={handleNumberChange}
                            max={Math.max(intervalLimits[frequency], interval)}
                        />
                    </View>
                    <View width={200}>
                        <Select
                            width="100%"
                            placeholder="Select frequency"
                            selected={[frequency]}
                            options={frequencies}
                            onSelect={handleSelect}
                            suffix={<IconLib icon="chevron-down" />}
                        />
                    </View>
                </View>

                {frequency === 'weekday' && (
                    <>
                        <Heading
                            colorToken="accent"
                            as="h6">
                            On these weekdays:
                        </Heading>
                        <ButtonGroup width="100%">
                            {defaultWeekdays.map((day, index) => (
                                <Button
                                    key={index}
                                    active={weekday.includes(index)}
                                    onClick={() => handleCustomDayClick(index)}>
                                    {day}
                                </Button>
                            ))}
                        </ButtonGroup>
                    </>
                )}

                <>
                    <Heading
                        colorToken="accent"
                        as="h6">
                        Repeat duration:
                    </Heading>

                    <View
                        row
                        gap="0.5rem"
                        width="100%"
                        justifyContent="flex-start">
                        <View width={175}>
                            <Select
                                width={175}
                                placeholder="Repeat"
                                selected={selected}
                                onSelect={handleRepetitionSelect}
                                options={[
                                    { key: 'forever', label: 'Forever' },
                                    { key: 'until', label: 'Until' },
                                    { key: 'times', label: 'Total occurrences' },
                                ]}
                                suffix={<IconLib icon="chevron-down" />}
                            />
                        </View>

                        <View flex={1}>
                            {selected[0] == 'times' && (
                                <View width={100}>
                                    <RepeatNumber
                                        max={Math.max(1000, count ?? 1)}
                                        number={count ?? 1}
                                        onNumberChange={handleRepetitionChange}
                                    />
                                </View>
                            )}

                            {selected[0] == 'until' && (
                                <View width="100%">
                                    <DatePickerProvider>
                                        <InputPopover
                                            popoverProps={{ width: 'fit-content' }}
                                            content={
                                                <View p={5}>
                                                    <DatePicker
                                                        defaultDate={to || new Date()}
                                                        selection={[[to || new Date(), to || new Date()]]}
                                                        onChange={handleDateChange}
                                                        width={300}
                                                        height={350}
                                                        monthProps={{ flex: 1 }}
                                                    />
                                                </View>
                                            }>
                                            <InputControl>
                                                <Input
                                                    readOnly
                                                    placeholder=""
                                                    value={
                                                        to?.toLocaleDateString(undefined, { dateStyle: 'medium' }) ||
                                                        '--'
                                                    }
                                                />
                                                <InputSuffix>
                                                    <IconLib
                                                        icon="date"
                                                        style={{ pointerEvents: 'none' }}
                                                    />
                                                </InputSuffix>
                                            </InputControl>
                                        </InputPopover>
                                    </DatePickerProvider>
                                </View>
                            )}
                        </View>
                    </View>
                </>
            </View>
            <Footer
                p="1rem"
                gap="0.5rem">
                <Button onClick={onDismiss}>Cancel</Button>
                <Flexer />
                <Button
                    subtle
                    variant="danger"
                    onClick={onClear}>
                    Don't repeat
                </Button>
                <Button
                    disabled={(frequency === 'weekday' && weekday.length === 0) || (selected[0] === 'until' && !to)}
                    onClick={handleSave}
                    variant="accent">
                    Save
                </Button>
            </Footer>
        </View>
    )
}
