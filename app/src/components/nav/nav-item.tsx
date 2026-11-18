import { Button, IconLib, Text, stopEvent } from '@fold-ui/core'
import { TagIcon } from '../common/tag-icon'

export const NavItem = ({
    name,
    icon,
    color = undefined,
    active = false,
    indent = 0,
    count = 0,
    isParent = false,
    collapsed = false,
    onCollapse = () => {},
    onNavigate,
    onEdit = null,
    ...rest
}) => (
    <div
        className={`nav__item f-row reveal-on-hover${isParent ? ' is-parent' : ''}`}
        onClick={onNavigate}
        role="button"
        tabIndex={0}
        aria-current={active ? 'page' : undefined}
        onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onNavigate()
            }
        }}
        {...rest}>
        <div
            style={{ '--indent': indent } as any}
            className={`nav__item-outer f-row${active ? ' is-active' : ''}`}>
            <div className="nav__item-icon f-row">
                {isParent && (
                    <button
                        className="f-button is-default nav__item-tool-button nav__item-collapse-button reveal-on-hover-target f-row"
                        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${name}`}
                        onClick={(event) => {
                            stopEvent(event)
                            onCollapse()
                        }}>
                        <IconLib
                            size="xs"
                            icon="triangle-down"
                            style={{ transform: collapsed ? 'rotateZ(-90deg)' : 'rotateZ(0deg)' }}
                        />
                    </button>
                )}
                <TagIcon
                    icon={icon || 'hash'}
                    color={color || 'var(--f-color-main-icon)'}
                    size="md"
                />
            </div>
            <div className="nav__item-text f-row f-ellipsis">
                <Text
                    className="nav-item__text f-ellipsis"
                    fontWeight="var(--f-font-weight-normal)"
                    color="var(--f-color-nav-item-text)">
                    {name}
                </Text>
            </div>
            <div className="nav__item-tools f-row">
                {onEdit && (
                    <Button
                        className="nav__item-tool-button reveal-on-hover-target reveal-to-hover-target"
                        aria-label={`Edit ${name}`}
                        onClick={(event) => {
                            stopEvent(event)
                            onEdit(event)
                        }}>
                        <IconLib
                            icon="more-h"
                            color="var(--f-color-nav-item-icon)"
                        />
                    </Button>
                )}
                {!!count && (
                    <Text
                        size="xs"
                        fontWeight="var(--f-font-weight-bold)"
                        colorToken="text-weakest">
                        {count}
                    </Text>
                )}
            </div>
        </div>
    </div>
)
