import { Button, Tooltip, type ButtonProps, type TooltipAnchor } from '@fold-ui/core'
import { forwardRef } from 'react'

type NoteButtonProps = ButtonProps & { 'aria-label': string; 'tooltipAnchor'?: TooltipAnchor }

export const NoteButton = forwardRef<HTMLButtonElement, NoteButtonProps>(
    ({ tooltipAnchor = 'bottom-center', ...props }, ref) => (
        <Tooltip
            anchor={tooltipAnchor}
            text={props['aria-label']}>
            <Button
                ref={ref}
                round
                square
                size="sm"
                {...props}
            />
        </Tooltip>
    )
)
