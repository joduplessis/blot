import { Button, Palette, View } from '@fold-ui/core'

export const ColorPanel = ({ onChange, color, colors, clearLabel = 'Clear' }) => (
    <View
        p="1rem"
        style={{ '--f-color-palette-radius': '5rem', '--f-color-palette-size': '16.5px' } as any}>
        <Palette
            width="100%"
            color={color}
            colors={colors}
            onChange={onChange}
        />
        <Button
            m="1rem 0 0 0"
            size="xs"
            disabled={!color}
            onClick={() => onChange('')}>
            <span className="f-text sm">{clearLabel}</span>
        </Button>
    </View>
)
