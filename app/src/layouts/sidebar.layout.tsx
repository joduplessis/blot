import { Resizable } from '@fold-ui/core'
import { useState } from 'react'

export const Resize = ({ children }) => {
    const [width] = useState(() => Number(localStorage.getItem('noted-list-width')) || 330)

    return (
        <Resizable
            column
            position="end"
            alignItems="stretch"
            justifyContent="flex-start"
            width={width}
            shrink={0}
            onChange={(width) => localStorage.setItem('noted-list-width', String(width))}
            min={260}
            max={480}
            height="100%"
            className="note-list-pane"
            handle={<></>}
            railProps={{ style: { '--f-resizable-color': 'transparent', 'zIndex': 100 } }}>
            {children}
        </Resizable>
    )
}
