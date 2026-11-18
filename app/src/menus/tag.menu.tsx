import { IconLib, Input, Menu, MenuHeading, MenuItem, MenuSection, Text, View } from '@fold-ui/core'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/app'
import { TAG_COLORS, TAG_ICONS } from '@/helpers/tags'
import { ColorPanel } from '@/components/common/color-panel'
import { IconPanel } from '@/components/common/icon-panel'
import { TagIcon } from '@/components/common/tag-icon'
import { createTagAutosave, type TagChanges } from '@/helpers/tag-autosave'
import { errorText } from '@/hooks/api.hooks'
import type { Tag } from '@/types'

export const TagMenu = ({ tag }: { tag: Tag }) => {
    const actions = useAppStore((state) => state.actions)
    const mounted = useRef(true)
    const nameValue = useRef(tag.text || '')
    const [text, setText] = useState(tag.text || '')
    const [color, setColor] = useState(tag.color ?? '#986a9c')
    const [icon, setIcon] = useState(tag.icon || '')
    const [error, setError] = useState('')
    const [draft] = useState(() =>
        createTagAutosave(
            { ...tag, color: tag.color ?? '#986a9c', icon: tag.icon || '' },
            (saved) => {
                if (nameValue.current.trim() === saved.text) actions.setError('')
                if (!mounted.current) return
                if (nameValue.current.trim() === saved.text) setError('')
            },
            (error) => {
                actions.setError(error)
                if (mounted.current) setError(errorText(error))
            }
        )
    )

    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])

    const update = (changes: TagChanges, delay = 0) => {
        draft.update(changes)
        actions.queueTagSave(draft.flush, delay)
    }

    return (
        <Menu
            width={240}
            shadow="none"
            disableAutoFocus>
            <MenuSection>
                <View
                    column
                    alignItems="stretch"
                    gap="0.9rem">
                    <Input
                        aria-label="Tag name"
                        placeholder="Tag name"
                        value={text}
                        onChange={(event) => {
                            const name = event.target.value
                            nameValue.current = name
                            setText(name)
                            setError(name.trim() ? '' : 'Give the tag a name.')
                            update({ text: name }, 300)
                        }}
                        onBlur={() => actions.flush().catch(() => {})}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return
                            event.preventDefault()
                            actions.flush().catch(() => {})
                        }}
                        required
                        autoFocus
                    />
                    {error && (
                        <Text
                            size="sm"
                            colorToken="danger"
                            role="alert">
                            {error}
                        </Text>
                    )}
                </View>
            </MenuSection>
            <MenuItem
                zIndex={10}
                position="relative"
                prefix={
                    <IconLib
                        icon="circle"
                        style={{ color: color || 'var(--f-color-surface-stronger)' }}
                    />
                }
                suffix={<IconLib icon="more-h" />}
                menu={
                    <Menu width={185}>
                        <MenuSection p={0}>
                            <ColorPanel
                                colors={TAG_COLORS}
                                color={color}
                                onChange={(color) => {
                                    setColor(color)
                                    update({ color })
                                }}
                            />
                        </MenuSection>
                    </Menu>
                }>
                Theme
            </MenuItem>
            <MenuItem
                zIndex={10}
                position="relative"
                prefix={<TagIcon icon={icon || 'hash'} />}
                suffix={<IconLib icon="more-h" />}
                menu={
                    <Menu width={225}>
                        <MenuSection p={0}>
                            <IconPanel
                                icons={TAG_ICONS}
                                icon={icon}
                                onChange={(icon) => {
                                    setIcon(icon)
                                    update({ icon })
                                }}
                            />
                        </MenuSection>
                    </Menu>
                }>
                Icon
            </MenuItem>
        </Menu>
    )
}
