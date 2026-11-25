import { Popover, Portal, type PopoverProps } from '@fold-ui/core'
import { autoUpdate } from '@floating-ui/dom'
import { useLayoutEffect, useState, type RefObject } from 'react'

// Keep the editor open at its last anchor when an edit moves the calendar entry.
export const AnchoredPopover = ({
    target,
    initialRect,
    initialFocus,
    onDismiss,
    ...props
}: PopoverProps & { target: HTMLElement; initialRect?: DOMRect; initialFocus?: RefObject<HTMLElement> }) => {
    const [panel, setPanel] = useState<HTMLElement | null>(null)
    const [position, setPosition] = useState(() => ({
        left: target.getBoundingClientRect().left,
        top: target.getBoundingClientRect().bottom,
    }))

    useLayoutEffect(() => {
        if (!panel) return

        const focusTarget = initialFocus?.current || panel
        focusTarget.focus({ preventScroll: true })
        let rect = initialRect || target.getBoundingClientRect()
        return autoUpdate(target, panel, () => {
            if (target.isConnected) rect = target.getBoundingClientRect()
            const left = Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8))
            const top =
                rect.bottom + panel.offsetHeight + 14 <= window.innerHeight
                    ? rect.bottom + 6
                    : Math.max(
                          8,
                          Math.min(rect.top - panel.offsetHeight - 6, window.innerHeight - panel.offsetHeight - 8)
                      )

            setPosition((last) => (last.left === left && last.top === top ? last : { left, top }))
        })
    }, [target, panel, initialRect, initialFocus])

    return (
        <Popover
            {...props}
            ref={setPanel}
            targetId={target.id}
            isVisible
            portal={Portal}
            anchor="bottom-left"
            fixPosition={position}
            focusTrap={false}
            refocusOnDismiss={false}
            onDismiss={(event) => {
                if (event.key === 'Escape') {
                    event.stopPropagation()
                    target.focus({ preventScroll: true })
                }
                onDismiss(event)
            }}
        />
    )
}
