import { Button, IconLib, Popover, Portal, stopEvent, useVisibility } from '@fold-ui/core'
import { LabelSelect } from './label-select'
import { Labels } from './labels'

export const LabelButton = ({ labels, onAdd, onDelete, disabled = false }) => {
    const { visible, show, hide } = useVisibility()

    return (
        <Popover
            portal={Portal}
            width={320}
            border="none"
            isVisible={visible}
            onDismiss={hide}
            content={
                <div
                    onMouseDown={stopEvent}
                    onClick={stopEvent}>
                    <LabelSelect
                        labels={labels}
                        onAdd={onAdd}
                        onDelete={onDelete}
                        onDismiss={hide}
                    />
                </div>
            }>
            <div className="f-label-button note-tags f-row">
                <Button
                    round
                    square
                    size="xs"
                    disabled={disabled}
                    aria-label="Edit note tags"
                    onClick={show}>
                    <IconLib
                        icon="tag"
                        size="sm"
                    />
                </Button>
                <Labels
                    labels={labels}
                    disabled={disabled}
                    onClick={show}
                />
            </div>
        </Popover>
    )
}
