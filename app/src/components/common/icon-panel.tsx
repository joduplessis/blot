import { Button, ButtonGroup, Flexer, IconLib, Popover, View, useVisibility } from '@fold-ui/core'
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react'

// Icon grid and shortcuts, using native emoji so the picker works offline.
export const IconPanel = ({ icons, icon, onChange }) => {
    const { show, hide, visible } = useVisibility()
    const handleEvent = (event) => event.nativeEvent.stopImmediatePropagation()

    return (
        <View
            p="1rem"
            position="relative">
            <View
                row
                width="100%"
                wrap="wrap"
                justifyContent="flex-start"
                gap={5}>
                {icons.map((item) => (
                    <View
                        as="button"
                        type="button"
                        p={0}
                        border="none"
                        bg="transparent"
                        row
                        key={item}
                        onClick={() => onChange(item)}
                        aria-label={item}
                        aria-pressed={icon === item}
                        className="f-buttonize"
                        colorToken={icon === item ? 'text' : 'text-weakest'}>
                        <IconLib icon={item} />
                    </View>
                ))}
            </View>
            <View
                row
                p="1rem 0 0 0"
                justifyContent="flex-start">
                <Button
                    size="xs"
                    disabled={!icon}
                    onClick={() => {
                        onChange('')
                        hide()
                    }}>
                    <span className="f-text sm">Clear</span>
                </Button>
            </View>
        </View>
    )
}
