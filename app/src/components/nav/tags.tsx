import {
    ContextMenuContext,
    DragElement,
    DragElementArea,
    Heading,
    MenuProvider,
    Text,
    stopEvent,
    useDrag,
    useDragEvent,
    type DragOrigin,
    type DragTarget,
} from '@fold-ui/core'
import { useContext, useState } from 'react'
import { useAppStore } from '@/store/app'
import { TagMenu } from '@/menus/tag.menu'
import {
    filterVisibleTags,
    getDescendantIds,
    getTagDropPosition,
    isDescendantOf,
    sortHierarchy,
} from '@/helpers/hierarchy'
import { NavItem } from './nav-item'

const TagList = () => {
    const tags = useAppStore((state) => state.tags)
    const notes = useAppStore((state) => state.notes)
    const filter = useAppStore((state) => state.filter)
    const actions = useAppStore((state) => state.actions)
    const { setMenu } = useContext(ContextMenuContext)
    const { restrictDualMovement } = useDrag()
    const [draggedId, setDraggedId] = useState<string | null>(null)
    const visible = filterVisibleTags(
        sortHierarchy(tags),
        tags.filter((tag) => tag.collapsed).map((tag) => tag.id),
        draggedId
    )
    const areaId = 'blot-tags'

    const openMenu = (event, tag) => {
        stopEvent(event)
        setDraggedId(null)
        restrictDualMovement(false)
        setMenu(tag, { x: event.clientX, y: event.clientY })
    }

    const save = (tag) => actions.saveTag(tag).catch(actions.setError)

    const drop = ({ detail: { origin, target } }: CustomEvent<{ origin: DragOrigin; target: DragTarget }>) => {
        if (origin.areaId !== areaId || target.areaId !== areaId) return
        restrictDualMovement(false)
        const dragged = tags.find((tag) => tag.id === origin.elementId)
        if (!dragged) return
        const { parentId, position } = getTagDropPosition(visible, tags, target)
        if (isDescendantOf(tags, parentId, dragged.id)) return
        void save({ ...dragged, parentId, position })
    }

    useDragEvent('ondrop', drop)
    useDragEvent('onend', () => {
        setDraggedId(null)
        restrictDualMovement(false)
    })

    return (
        <div className="nav__section">
            <div
                className="reveal-on-hover f-row nav__section-inner"
                style={{ justifyContent: 'flex-start' }}>
                <Heading
                    as="h6"
                    className="nav-section-heading f-ellipsis">
                    Tags
                </Heading>
            </div>
            <DragElementArea
                indent
                areaId={areaId}
                group="blot-tags"
                variant="lined-focus"
                direction="vertical">
                {visible.map((tag) => {
                    const ids = new Set([tag.id, ...getDescendantIds(tags, tag.id)])
                    const count = notes.filter(
                        (note) => !note.trashedAt && note.tagIds.some((id) => ids.has(id))
                    ).length

                    return (
                        <DragElement
                            onlyIndentDataAttr
                            key={tag.id}
                            style={{ width: '100%' }}
                            indent={tag.indent}
                            data-id={tag.id}
                            id={tag.id}
                            onMouseDown={(event) => {
                                if (event.button !== 0 || event.target.closest('button')) return
                                setDraggedId(tag.id)
                                restrictDualMovement()
                            }}>
                            <NavItem
                                name={tag.text}
                                icon={tag.icon || 'hash'}
                                active={filter === tag.id}
                                indent={tag.indent}
                                color={tag.color}
                                count={count}
                                isParent={tag.isParent}
                                collapsed={tag.collapsed}
                                onCollapse={() => save({ ...tag, collapsed: !tag.collapsed })}
                                onEdit={(event) =>
                                    openMenu(
                                        event,
                                        tags.find((item) => item.id === tag.id)
                                    )
                                }
                                onContextMenu={(event) =>
                                    openMenu(
                                        event,
                                        tags.find((item) => item.id === tag.id)
                                    )
                                }
                                onNavigate={() => actions.setFilter(tag.id)}
                            />
                        </DragElement>
                    )
                })}
            </DragElementArea>
            {!tags.length && (
                <Text
                    size="sm"
                    p="0.5rem 1rem 0.5rem 1.6rem"
                    colorToken="text-weaker">
                    Type #tag in a note to organize it here.
                </Text>
            )}
        </div>
    )
}

export const Tags = () => (
    <MenuProvider
        menu={({ data }) => (
            <TagMenu
                key={data.id}
                tag={data}
            />
        )}>
        <TagList />
    </MenuProvider>
)
