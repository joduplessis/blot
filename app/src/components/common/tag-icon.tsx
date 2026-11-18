import { IconLib, IconLibProps } from '@fold-ui/core'
import { Emoji, EmojiStyle } from 'emoji-picker-react'

const EMOJI_SIZE = { xs: 12, sm: 16, md: 20, lg: 24, xl: 32 }

export const TagIcon = ({ icon, size = 'md', ...rest }: IconLibProps) =>
    icon?.startsWith('emoji:') ? (
        <span
            aria-hidden="true"
            className="f-row">
            <Emoji
                unified={icon.slice(6)}
                emojiStyle={EmojiStyle.NATIVE}
                size={EMOJI_SIZE[size]}
            />
        </span>
    ) : (
        <IconLib
            icon={icon}
            size={size}
            {...rest}
        />
    )
