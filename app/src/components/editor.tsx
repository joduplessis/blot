import { View } from '@fold-ui/core'
import { Tiptap } from './tiptap'

export const Editor = ({ value, onChange, placeholder = 'Start writing…', minHeight = 180 }) => (
    <View
        width="100%"
        style={{ minHeight }}>
        <Tiptap
            content={value}
            onUpdate={onChange}
            placeholder={placeholder}
        />
    </View>
)
