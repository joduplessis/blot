import { Button, ButtonGroup, IconLib, Modal, Popover, Portal, Text, View } from '@fold-ui/core'
import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { NoteButton } from '@/components/note-button'
import { ColorPanel } from '@/components/common/color-panel'
import { TAG_COLORS } from '@/helpers/tags'
import { errorText } from '@/hooks/api.hooks'

type Point = { x: number; y: number }
type Stroke = { color: string | null; width: number; points: Point[] }

const paint = (canvas: HTMLCanvasElement, stroke: Stroke, background: string, start = 0) => {
    const context = canvas.getContext('2d')
    const { points, width } = stroke
    const color = stroke.color ?? background
    const { x, y } = points[start]

    context.beginPath()
    if (points.length === 1) {
        context.fillStyle = color
        context.arc(x, y, width / 2, 0, Math.PI * 2)
        context.fill()
        return
    }

    context.strokeStyle = color
    context.lineWidth = width
    context.lineJoin = context.lineCap = 'round'
    context.moveTo(x, y)
    for (let i = start + 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y)
    context.stroke()
}

export const DrawingModal = ({
    onSave,
    onDismiss,
}: {
    onSave(file: Promise<File>): Promise<void>
    onDismiss(): void
}) => {
    const canvas = useRef<HTMLCanvasElement>(null)
    const strokes = useRef<Stroke[]>([])
    const pointer = useRef<number | null>(null)
    const [palette, setPalette] = useState<'Ink' | 'Background' | null>(null)
    const [color, setColor] = useState('')
    const [background, setBackground] = useState('')
    const [width, setWidth] = useState(4)
    const [eraser, setEraser] = useState(false)
    const [hasStrokes, setHasStrokes] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const ink = color || '#292830'
    const paperColor = background || 'white'

    const redraw = () => {
        const paper = canvas.current
        const context = paper.getContext('2d')
        context.fillStyle = paperColor
        context.fillRect(0, 0, paper.width, paper.height)

        for (const stroke of strokes.current) paint(paper, stroke, paperColor)
    }

    const draw = (event: PointerEvent<HTMLCanvasElement>) => {
        const paper = event.currentTarget
        const starting = event.type === 'pointerdown'
        if (saving || !event.isPrimary) return
        if (starting ? pointer.current !== null || event.button !== 0 : pointer.current !== event.pointerId) return

        const bounds = paper.getBoundingClientRect()
        const scale = paper.width / bounds.width
        const point = { x: (event.clientX - bounds.left) * scale, y: (event.clientY - bounds.top) * scale }

        if (starting) {
            if (eraser && !strokes.current.length) return

            event.preventDefault()
            paper.focus({ preventScroll: true })
            pointer.current = event.pointerId
            paper.setPointerCapture(event.pointerId)
            strokes.current.push({
                color: eraser ? null : ink,
                width: (eraser ? width * 4 : width) * scale,
                points: [],
            })
            setHasStrokes(true)
        }

        const stroke = strokes.current[strokes.current.length - 1]
        const last = stroke.points[stroke.points.length - 1]
        if (last?.x === point.x && last.y === point.y) return

        stroke.points.push(point)
        paint(paper, stroke, paperColor, Math.max(0, stroke.points.length - 2))
    }

    const undo = () => {
        if (pointer.current !== null) return

        strokes.current.pop()
        redraw()

        setHasStrokes(strokes.current.length > 0)
    }

    const save = async () => {
        setSaving(true)
        setError('')

        try {
            const file = new Promise<File>((resolve, reject) => {
                canvas.current.toBlob((blob) => {
                    if (!blob) return reject(new Error('Could not create the drawing image.'))

                    resolve(new File([blob], 'Drawing.png', { type: 'image/png' }))
                }, 'image/png')
            })
            await onSave(file)
            onDismiss()
        } catch (error) {
            setError(errorText(error))
            setSaving(false)
        }
    }

    const colorButton = (name: 'Ink' | 'Background') => {
        const isInk = name === 'Ink'
        const id = 'drawing-' + name.toLowerCase()
        const open = palette === name

        return (
            <Popover
                portal={Portal}
                targetId={id}
                ignoreContainers={[id]}
                width={185}
                anchor="top-center"
                role="dialog"
                aria-label={`${name} palette`}
                isVisible={open}
                onDismiss={() => setPalette(null)}
                content={
                    <ColorPanel
                        colors={TAG_COLORS}
                        color={isInk ? color : background}
                        clearLabel={isInk ? 'Reset to black' : 'Reset to white'}
                        onChange={(value) => {
                            if (isInk) {
                                setColor(value)
                                setEraser(false)
                            } else {
                                setBackground(value)
                            }

                            setPalette(null)
                            canvas.current.focus({ preventScroll: true })
                        }}
                    />
                }>
                <NoteButton
                    aria-label={`${name} colour`}
                    tooltipAnchor="top-center"
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    onClick={() => setPalette(open ? null : name)}>
                    <View
                        as="span"
                        width={13}
                        height={13}
                        radius={isInk ? '50%' : 'var(--f-radius-2xs)'}
                        bg={isInk ? ink : paperColor}
                        border="1px solid var(--f-color-border)"
                    />
                </NoteButton>
            </Popover>
        )
    }

    useLayoutEffect(() => {
        const paper = canvas.current
        const area = paper.parentElement
        paper.width = Math.round(area.clientWidth * window.devicePixelRatio)
        paper.height = Math.round(area.clientHeight * window.devicePixelRatio)
    }, [])

    useLayoutEffect(redraw, [paperColor])

    return (
        <Modal
            className="drawing-modal"
            role="dialog"
            aria-label="Drawing pad"
            width="60vw"
            height="80vh"
            portal={Portal}
            isVisible
            focusTrap={false}
            disableBackgroundDismiss
            onDismiss={palette ? () => setPalette(null) : () => !saving && onDismiss()}
            onKeyDownCapture={(event) => {
                if (!event.metaKey && !event.ctrlKey) return

                event.stopPropagation()
                if (event.key.toLowerCase() === 'z' && !event.shiftKey && !saving) {
                    event.preventDefault()
                    undo()
                }
            }}
            footer={
                <View
                    row
                    wrap="wrap"
                    justifyContent="center"
                    width="100%"
                    gap={12}>
                    {colorButton('Ink')}
                    {colorButton('Background')}
                    <ButtonGroup
                        role="group"
                        aria-label="Pen thickness">
                        {[2, 4, 8].map((size) => (
                            <NoteButton
                                key={size}
                                aria-label={`${size} px`}
                                tooltipAnchor="top-center"
                                active={width === size}
                                aria-pressed={width === size}
                                onClick={() => setWidth(size)}>
                                <View
                                    as="span"
                                    width={size}
                                    height={size}
                                    radius="50%"
                                    bg="currentColor"
                                />
                            </NoteButton>
                        ))}
                    </ButtonGroup>
                    <ButtonGroup
                        role="group"
                        aria-label="Drawing tools">
                        <NoteButton
                            aria-label="Eraser"
                            tooltipAnchor="top-center"
                            active={eraser}
                            aria-pressed={eraser}
                            onClick={() => setEraser(!eraser)}>
                            <IconLib icon="eraser" />
                        </NoteButton>
                        <NoteButton
                            aria-label="Undo stroke"
                            tooltipAnchor="top-center"
                            disabled={!hasStrokes || saving}
                            onClick={undo}>
                            <IconLib icon="reply" />
                        </NoteButton>
                    </ButtonGroup>
                    {error && (
                        <Text
                            role="alert"
                            size="sm"
                            colorToken="danger">
                            {error}
                        </Text>
                    )}
                    <Button
                        size="sm"
                        round
                        disabled={saving}
                        onClick={onDismiss}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        round
                        m="0 0 0 -0.5rem"
                        variant="accent"
                        disabled={(!hasStrokes && !background) || saving}
                        loading={saving}
                        onClick={save}>
                        Insert
                    </Button>
                </View>
            }>
            <canvas
                ref={canvas}
                tabIndex={-1}
                aria-label="Drawing canvas"
                onPointerDown={draw}
                onPointerMove={draw}
                onPointerUp={draw}
                onLostPointerCapture={(event) => {
                    if (pointer.current === event.pointerId) pointer.current = null
                }}
            />
        </Modal>
    )
}
