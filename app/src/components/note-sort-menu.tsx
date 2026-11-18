import { IconLib, Menu, MenuButton, MenuItem, Portal } from '@fold-ui/core'
import { NOTE_SORT_OPTIONS } from '@/helpers/note-sort'
import { useAppStore } from '@/store/app'

export const NoteSortMenu = () => {
    const noteSort = useAppStore((state) => state.noteSort)
    const actions = useAppStore((state) => state.actions)

    return (
        <MenuButton
            round
            square
            size="sm"
            aria-label="Sort notes"
            aria-haspopup="menu"
            aria-description={`Currently sorted by ${NOTE_SORT_OPTIONS.find(
                (option) => option.value === noteSort
            )!.label.toLowerCase()}`}
            popoverProps={{ portal: Portal, preferredHorizontalAnchor: 'right' }}
            menu={({ dismiss }) => (
                <Menu
                    width={190}
                    aria-label="Sort notes">
                    {NOTE_SORT_OPTIONS.map(({ value, label }) => (
                        <MenuItem
                            key={value}
                            active={noteSort === value}
                            suffix={
                                noteSort === value ? (
                                    <IconLib
                                        icon="check"
                                        size="sm"
                                    />
                                ) : undefined
                            }
                            onClick={() => {
                                actions.setNoteSort(value)
                                dismiss()
                            }}>
                            {label}
                        </MenuItem>
                    ))}
                </Menu>
            )}>
            <IconLib
                icon="selector"
                size="sm"
            />
        </MenuButton>
    )
}
