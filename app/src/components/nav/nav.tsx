import {
    Button,
    ButtonGroup,
    DarkModeButton,
    DragElement,
    DragElementArea,
    Flexer,
    IconLib,
    Resizable,
    Sidebar,
    View,
    useDialog,
} from '@fold-ui/core'
import { useState, type MouseEvent } from 'react'
import { useAppStore } from '@/store/app'
import { NavItem } from './nav-item'
import { Tags } from './tags'
import { SettingsModal } from '@/modals/settings.modal'

export const Nav = () => {
    const { setDialog, closeDialog } = useDialog()

    const privacy = useAppStore((state) => state.privacy)
    const locking = useAppStore((state) => state.locking)
    const notes = useAppStore((state) => state.notes)
    const filter = useAppStore((state) => state.filter)
    const actions = useAppStore((state) => state.actions)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const syncError = useAppStore((state) => state.sync?.error)
    const [width] = useState(() => Number(localStorage.getItem('noted-nav-width')) || 245)
    const active = notes.filter((note) => !note.trashedAt)
    const upcoming = active.filter(
        (note) => note.scheduledTasks.length && (!note.encrypted || (privacy.unlocked && !locking))
    )

    const toggleLock = () => {
        if (!privacy.unlocked) return actions.requestUnlock()

        setDialog({
            title: 'Lock Blot?',
            description: 'Are you sure you want to lock Blot? You will need your PIN to unlock protected notes.',
            footer: (
                <View
                    row
                    gap={10}
                    width="100%">
                    <Button onClick={closeDialog}>Cancel</Button>
                    <Flexer />
                    <Button
                        onClick={() => {
                            closeDialog()
                            actions.lock().catch(actions.setError)
                        }}>
                        Lock Blot
                    </Button>
                </View>
            ),
        })
    }

    const dropNotes = (event: MouseEvent<HTMLDivElement>) => {
        if (event.button !== 0 || !useAppStore.getState().draggedNoteIds.length) return

        // Use the actual release target: Fold can retain the last hovered row after leaving it.
        const element = (event.target as HTMLElement).closest<HTMLElement>('[data-dragelement]')
        const { areaid, id } = element?.dataset || {}
        if (areaid !== 'blot-tags' && !(areaid === 'blot-navigation' && id === 'trash')) return

        actions.dropNotes(id)
    }

    return (
        <Sidebar
            left
            border="none"
            className="nav"
            style={{ '--f-drag-placeholder-background': 'var(--f-color-background)' }}>
            <Resizable
                className="nav-resizable"
                column
                justifyContent="stretch"
                width={width}
                max={360}
                min={210}
                height="calc(100% + var(--nav-window-controls-height))"
                p="calc(var(--nav-window-controls-height) + 1rem) 0 0"
                handle={<></>}
                onChange={(width) => localStorage.setItem('noted-nav-width', String(width))}
                railProps={{ style: { '--f-resizable-color': 'transparent' } }}>
                <div className="nav__items">
                    <div
                        className="nav__items-inner f-scrollbar"
                        onMouseUpCapture={dropNotes}>
                        <DragElementArea
                            areaId="blot-navigation"
                            group="blot-navigation"
                            variant="focus">
                            {[
                                ['all', 'All notes', 'documents', active.length],
                                ['pinned', 'Pinned', 'pin', active.filter((note) => note.pinned).length],
                                ['upcoming', 'Calendar', 'calendar', upcoming.length],
                                ['untagged', 'Untagged', 'tag', active.filter((note) => !note.tagIds.length).length],
                                ['trash', 'Trash', 'trash', notes.length - active.length],
                            ].map(([id, name, icon, count]) => (
                                <DragElement
                                    key={id}
                                    id={id}
                                    noDrag
                                    noDrop={id !== 'trash'}>
                                    <NavItem
                                        name={name}
                                        icon={icon}
                                        count={Number(count)}
                                        active={filter === id}
                                        onNavigate={() => actions.setFilter(String(id))}
                                    />
                                </DragElement>
                            ))}
                        </DragElementArea>
                        <div className="nav-divider" />
                        <Tags />
                    </div>
                </div>
                <View
                    row
                    shrink={0}
                    width="100%"
                    p="0 1.6rem 1.6rem 1.6rem"
                    gap="0.5rem"
                    justifyContent="flex-end">
                    <Button
                        round
                        square
                        aria-label={syncError ? 'Settings - sync needs attention' : 'Settings'}
                        onClick={() => setSettingsOpen(true)}>
                        <IconLib icon={syncError ? 'warning' : 'cog'} />
                    </Button>
                    <Flexer />
                    <ButtonGroup aria-label="Note controls">
                        {privacy.pinSet && (
                            <Button
                                round
                                square
                                aria-label={privacy.unlocked ? 'Lock Blot' : 'Unlock Blot'}
                                disabled={locking}
                                onClick={toggleLock}>
                                <IconLib icon={!privacy.unlocked || locking ? 'lock' : 'lock-open'} />
                            </Button>
                        )}
                        <DarkModeButton
                            round
                            square
                            aria-label="Toggle color theme"
                        />
                        <Button
                            round
                            square
                            aria-label="New note"
                            onClick={actions.createNote}>
                            <IconLib icon="pen" />
                        </Button>
                    </ButtonGroup>
                </View>
            </Resizable>
            {settingsOpen && <SettingsModal onDismiss={() => setSettingsOpen(false)} />}
        </Sidebar>
    )
}
