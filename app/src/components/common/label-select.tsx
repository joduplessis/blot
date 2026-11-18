import { Flexer, IconLib, Select, Text, View, getKey } from '@fold-ui/core'
import { ReactElement, useContext, useEffect } from 'react'
import { CommonContext } from './common.provider'
import { Label } from './labels'

export type LabelSelectLabel = { id: string | number; icon?: string; color?: string; text: string }
export type LabelSelectProps = {
    labels: LabelSelectLabel[]
    onAdd?: (label: LabelSelectLabel) => void
    onDelete?: (label: LabelSelectLabel) => void
    footer?: ReactElement | null
    onDismiss?: () => void
}

export const OptionComponent = ({ option, onOptionClick, selected }) => (
    <View
        row
        p="var(--f-space-1)"
        gap="0.5rem"
        width="100%"
        className="label-option-component"
        justifyContent="flex-start"
        radius="var(--f-radius-sm)"
        onClick={onOptionClick}
        color={selected ? 'var(--f-color-text)' : 'transparent'}>
        <IconLib icon="check" />
        <Label
            id={option.key}
            text={option.label}
            color={option.color}
            icon={option.icon}
        />
        <Flexer />
        {!option.key && (
            <Text
                size="xs"
                colorToken="text-weak">
                Create
            </Text>
        )}
    </View>
)

export const LabelSelect = ({ labels = [], onAdd, onDelete, onDismiss, footer }: LabelSelectProps) => {
    const { availableLabels, onLabelFilter } = useContext(CommonContext)
    const options = availableLabels.map((label) => ({
        key: label.id,
        label: label.text,
        color: label.color,
        icon: label.icon,
    }))

    useEffect(() => onLabelFilter(''), [])

    return (
        <Select
            tagInput
            variant="static"
            noListFocus
            width="100%"
            trapFocus
            placeholder="Find or create a tag…"
            selected={labels.map((label) => label.id)}
            options={options}
            optionComponent={OptionComponent}
            filterDelay={150}
            selectListProps={{
                noOptionsComponent: <Text p="var(--f-select-option-padding)">Type to create your first tag.</Text>,
            }}
            tagInputFieldProps={{
                'aria-label': 'Find or create a tag',
                'onKeyDown': (event) => {
                    const { isBackspace, isEscape } = getKey(event)
                    if (isEscape) onDismiss?.()
                    if (isBackspace && !(event.target as HTMLInputElement).value && labels.length)
                        onDelete?.(labels[labels.length - 1])
                },
            }}
            onSelect={(option, dismiss, clear) => {
                const selected = labels.find((label) => label.id === option.key)
                const label = availableLabels.find((label) => label.id === option.key)
                if (selected) onDelete?.(selected)
                else if (label) onAdd?.(label)
                clear()
                onLabelFilter('')
            }}
            onFilter={onLabelFilter}
            footer={footer}
            render={() =>
                labels.map((label) => (
                    <Label
                        key={label.id}
                        {...label}
                        suffix={
                            <button
                                aria-label={`Remove ${label.text}`}
                                onClick={() => onDelete?.(label)}
                                className="f-buttonize label-select-x f-row">
                                <IconLib
                                    icon="x"
                                    size="sm"
                                />
                            </button>
                        }
                    />
                ))
            }
        />
    )
}
