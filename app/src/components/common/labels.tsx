import { TagIcon } from './tag-icon'
import { classNames, stopEvent } from '@fold-ui/core'
import { useEffect, useMemo, useState } from 'react'
import { byText } from '../../helpers'
import { LabelSelectLabel } from './label-select'
export type LabelsLabel = {} & LabelSelectLabel

export type LabelProps = {
    disabled?: boolean
    onClick?: (e) => void
    suffix?: any
} & LabelsLabel

export const Label = (props: LabelProps) => {
    const { onClick, disabled, id, text, suffix } = props
    const color = props.color || 'var(--f-color-text-weak)'
    const { isDouble, words } = useMemo(() => {
        return {
            isDouble: text.includes(':'),
            words: text.split(':'),
        }
    }, [text])
    const doubleStyle: any = useMemo(
        () => ({
            color,
            backgroundColor: 'rgba(from var(--f-color-surface) r g b / 80%)',
        }),
        [text, disabled, color, isDouble]
    )
    const style: any = useMemo(
        () => ({
            'pointerEvents': disabled ? 'none' : undefined,
            '--f-label-color': color,
        }),
        [text, disabled, color, isDouble]
    )
    const className = classNames({
        'f-label': true,
        'f-buttonize': !!onClick,
        'f-row': true,
        'f-ellipsis': !isDouble,
        'is-double': isDouble,
    })

    return (
        <span
            style={style}
            className={className}
            onClick={
                onClick
                    ? (e) => {
                          stopEvent(e)
                          onClick(e)
                      }
                    : undefined
            }>
            {props.icon && (
                <TagIcon
                    icon={props.icon}
                    size="xs"
                />
            )}
            {isDouble && (
                <>
                    <span
                        className="f-label__first f-row"
                        style={doubleStyle}>
                        {words[0]}
                    </span>
                    <span className="f-label__second f-row">{words[1]}</span>
                </>
            )}

            {!isDouble && <span className="f-row f-ellipsis">{text}</span>}

            {suffix}
        </span>
    )
}

export type LabelsProps = {
    shorten?: boolean
    disabled?: boolean
    labels: LabelsLabel[]
    onClick?: (e) => void
}

export const Labels = ({ shorten, labels, disabled, onClick }: LabelsProps) => {
    const [sortedLabels, setSortedLabels] = useState([])
    const [more, setMore] = useState(0)

    useEffect(() => {
        const sortedLabels = [...labels].sort(byText)
        setSortedLabels(labels)
        //if (shorten) setMore(sortedLabels.length > 5 ? sortedLabels.length - 5 : 0)
    }, [labels, labels.length, shorten])

    if (labels.length == 0) return null

    return (
        <>
            {/*  {!!more && (
                <Label
                    disabled={disabled}
                    id=""
                    icon={undefined}
                    text={`+ ${more}`}
                    color={Token.ColorBase500}
                    onClick={onClick}
                />
            )} */}
            {[...labels]
                //.filter((_, index: number) => shorten ? index < 5 : true)
                .sort(byText)
                .map((label: any) => (
                    <Label
                        disabled={disabled}
                        key={label.id}
                        id={label.id}
                        icon={label.icon}
                        text={label.text}
                        color={label.color}
                        onClick={onClick}
                    />
                ))}
        </>
    )
}
