import { Button, IconLib, Input, Popover, Portal, Text, View, stopEvent, useVisibility } from '@fold-ui/core'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { createDocument, Extension, getHTMLFromFragment, type Editor } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { EditorState, Plugin, TextSelection, type Transaction } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import Typography from '@tiptap/extension-typography'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { notesAPI } from '@/hooks/api.hooks'
import { DrawingModal } from '@/modals/drawing.modal'
import { useAppStore } from '@/store/app'
import { Hashtags } from './hashtag-extension'
import { bodyText } from '@/helpers/hashtags'
import { NoteButton } from './note-button'
import { NoteAttachment } from './attachment-extension'
import { NoteImage } from './image-extension'
import { readSchedule } from '@/helpers/task-schedule'
import { AnchoredPopover } from './common/anchored-popover'
import { DateSelect } from './common/date-select'
import { DatedTaskItem, type TaskDatePicker } from './task-item-extension'

const MenuBar = ({ editor, onLink, blocks = false }) => {
    const active = useEditorState({
        editor,
        selector: ({ editor }) => ({
            bold: editor.isActive('bold'),
            italic: editor.isActive('italic'),
            strike: editor.isActive('strike'),
            code: editor.isActive('code'),
            highlight: editor.isActive('highlight'),
            link: editor.isActive('link'),
            heading1: editor.isActive('heading', { level: 1 }),
            heading2: editor.isActive('heading', { level: 2 }),
            heading3: editor.isActive('heading', { level: 3 }),
            bulletList: editor.isActive('bulletList'),
            orderedList: editor.isActive('orderedList'),
            taskList: editor.isActive('taskList'),
            blockquote: editor.isActive('blockquote'),
            codeBlock: editor.isActive('codeBlock'),
        }),
    })
    const inline = [
        ['bold', 'Bold (⌘B)', () => editor.chain().focus().toggleBold().run()],
        ['italic', 'Italic (⌘I)', () => editor.chain().focus().toggleItalic().run()],
        ['strikethrough', 'Strikethrough', () => editor.chain().focus().toggleStrike().run(), 'strike'],
        ['code', 'Inline code', () => editor.chain().focus().toggleCode().run()],
        ['highlighter', 'Highlight', () => editor.chain().focus().toggleHighlight().run(), 'highlight'],
        ['link', 'Link (⌘K)', onLink],
    ] as const

    return (
        <View
            column
            width={blocks ? '100%' : undefined}
            alignItems="stretch"
            gap={6}
            p={blocks ? 8 : 4}
            onMouseDown={(event) => event.preventDefault()}>
            <View
                row
                width={blocks ? '100%' : undefined}
                gap={2}
                justifyContent="flex-start"
                className="tiptap-menubar">
                {inline.map(([icon, label, action, state]) => (
                    <Button
                        key={icon}
                        size="sm"
                        square
                        subtle
                        flex={blocks ? 1 : undefined}
                        variant={active[state || icon] ? 'accent' : 'default'}
                        aria-label={label}
                        aria-pressed={active[state || icon]}
                        active={active[state || icon]}
                        onClick={action}>
                        <IconLib
                            icon={icon}
                            size="sm"
                            color="currentColor"
                        />
                    </Button>
                ))}
            </View>
            {blocks && (
                <>
                    <Text
                        size="xs"
                        width="100%"
                        colorToken="text-weaker"
                        p="8px 8px 2px">
                        TEXT STYLE
                    </Text>
                    {[
                        ['Heading 1', '#', 'heading1', () => editor.chain().focus().toggleHeading({ level: 1 }).run()],
                        ['Heading 2', '##', 'heading2', () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
                        [
                            'Heading 3',
                            '###',
                            'heading3',
                            () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
                        ],
                        ['Bullet list', '−', 'bulletList', () => editor.chain().focus().toggleBulletList().run()],
                        ['Numbered list', '1.', 'orderedList', () => editor.chain().focus().toggleOrderedList().run()],
                        ['Checklist', '☑', 'taskList', () => editor.chain().focus().toggleTaskList().run()],
                        ['Quote', '❯', 'blockquote', () => editor.chain().focus().toggleBlockquote().run()],
                        ['Code block', '</>', 'codeBlock', () => editor.chain().focus().toggleCodeBlock().run()],
                    ].map(([label, symbol, state, action]) => (
                        <Button
                            key={String(label)}
                            subtle
                            width="100%"
                            variant={active[String(state)] ? 'accent' : 'default'}
                            aria-pressed={active[String(state)]}
                            active={active[String(state)]}
                            onClick={action as () => void}
                            className="format-menu-item">
                            <Text
                                width={32}
                                color="currentColor"
                                style={{ fontFamily: 'var(--f-font-mono)' }}>
                                {String(symbol)}
                            </Text>
                            {String(label)}
                        </Button>
                    ))}
                    <Text
                        size="xs"
                        colorToken="text-weaker"
                        p="8px">
                        Or type Markdown: #, **bold**, - or [ ] followed by a space.
                    </Text>
                </>
            )}
        </View>
    )
}

const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

export const Tiptap = ({
    noteId = '',
    content = '',
    onUpdate,
    placeholder = 'Start writing…',
    disabled = false,
    formattingTarget = null,
    uploadTarget = null,
}) => {
    const update = useRef(onUpdate)
    update.current = onUpdate
    const formatting = useVisibility()
    const [link, setLink] = useState<string | null>(null)
    const [datePicker, setDatePicker] = useState<TaskDatePicker | null>(null)
    const [linkError, setLinkError] = useState('')
    const [pendingUploads, setPendingUploads] = useState(0)
    const [drawing, setDrawing] = useState(false)
    const fileInput = useRef<HTMLInputElement>(null)
    const currentEditor = useRef<Editor | null>(null)
    const actions = useAppStore((state) => state.actions)
    const tags = useAppStore((state) => state.tags)
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                link: {
                    openOnClick: false,
                    defaultProtocol: 'https',
                    HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
                },
            }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Highlight,
            TaskList,
            DatedTaskItem.configure({ nested: true, onPick: setDatePicker }),
            Typography,
            Hashtags,
            NoteImage,
            NoteAttachment,
            Placeholder.configure({ placeholder }),
            Extension.create({
                name: 'blotShortcuts',
                addProseMirrorPlugins() {
                    return [
                        new Plugin({
                            filterTransaction: (transaction) => {
                                if (
                                    !transaction.docChanged ||
                                    !useAppStore.getState().notes.find((note) => note.id === noteId)?.encrypted
                                )
                                    return true
                                let hasFile = false
                                transaction.doc.descendants((node) => {
                                    if (node.type.name === 'image' || node.type.name === 'attachment') hasFile = true
                                })

                                return !hasFile
                            },
                        }),
                    ]
                },
                addKeyboardShortcuts() {
                    return {
                        'Mod-k': () => {
                            setLink(this.editor.getAttributes('link').href || '')
                            setLinkError('')
                            return true
                        },
                        'Tab': () =>
                            this.editor.isActive('codeBlock') ? this.editor.commands.insertContent('    ') : false,
                    }
                },
            }),
        ],
        content: content || '<p></p>',
        editable: !disabled,
        editorProps: {
            attributes: {
                'aria-label': 'Note body',
                'role': 'textbox',
                'aria-multiline': 'true',
                'spellcheck': 'true',
            },
            handleDOMEvents: {
                click: (_view, event) => {
                    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]')
                    if (!anchor || event.button !== 0) return false

                    event.preventDefault()
                    if (!event.shiftKey && window.getSelection()?.isCollapsed)
                        notesAPI().openExternal(anchor.href).catch(actions.setError)

                    return true
                },
            },
            transformPastedHTML: (html) => {
                if (!html.includes('data-schedule')) return html

                const template = document.createElement('template')
                template.innerHTML = html
                for (const item of template.content.querySelectorAll('li[data-schedule]')) {
                    const schedule = readSchedule(item.getAttribute('data-schedule'))
                    if (schedule)
                        item.setAttribute('data-schedule', JSON.stringify({ ...schedule, id: crypto.randomUUID() }))
                }

                return template.innerHTML
            },
            handlePaste: (_view, event) => {
                const files = Array.from(event.clipboardData?.files || [])
                if (!files.length) return false

                event.preventDefault()
                actions.queueFileImport(insertFiles(files, undefined, 'image').catch(actions.setError))
                return true
            },
            handleDrop: (view, event, _slice, moved) => {
                if (moved) return false
                const files = Array.from(event.dataTransfer?.files || [])
                if (!files.length) return false

                event.preventDefault()
                const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
                actions.queueFileImport(insertFiles(files, position).catch(actions.setError))
                return true
            },
        },
        onUpdate: ({ editor }) => update.current?.(editor.getHTML(), editor.getText()),
    })
    currentEditor.current = editor

    const insertFiles = async (files: (File | Promise<File>)[], position?: number, kind?: 'image' | 'attachment') => {
        if (useAppStore.getState().notes.find((note) => note.id === noteId)?.encrypted)
            throw new Error('Images and attachments cannot be added to encrypted notes.')

        const target = currentEditor.current
        if (!target || target.isDestroyed || !target.isEditable || !files.length) return

        const { schema } = target
        let bookmark = (
            position === undefined ? target.state.selection : TextSelection.near(target.state.doc.resolve(position))
        ).getBookmark()
        const trackPosition = ({ transaction }: { transaction: Transaction }) => {
            bookmark = bookmark.map(transaction.mapping)
        }
        target.on('transaction', trackPosition)
        setPendingUploads((count) => count + 1)

        try {
            const nodes: ProseMirrorNode[] = []
            for (const input of files) {
                const file = await input
                if (file.size > 25 * 1024 * 1024) throw new Error('Choose a file of 25 MB or less.')

                const image = kind
                    ? kind === 'image'
                    : imageTypes.includes(file.type) || (!file.type && /\.(png|jpe?g|gif|webp)$/i.test(file.name))
                const data = new Uint8Array(await file.arrayBuffer())
                const source = await actions.importFile(data, noteId, image ? undefined : file.name)
                nodes.push(
                    image
                        ? schema.nodes.image.create({ src: source, alt: file.name })
                        : schema.nodes.attachment.create({ href: source, name: file.name })
                )
            }

            const note = useAppStore.getState().notes.find((note) => note.id === noteId)
            if (!note || note.trashedAt || note.encrypted) return

            const state = target.isDestroyed
                ? EditorState.create({ doc: createDocument(note.body, schema) })
                : target.state
            const { from, to, $from } = bookmark.resolve(state.doc)
            // Code blocks accept only text. Split around the file and keep the surrounding code formatted.
            const content = Fragment.fromArray(
                nodes.map((node) =>
                    $from.parent.type.spec.code && node.isInline ? schema.nodes.paragraph.create(null, node) : node
                )
            )

            if (target.isDestroyed) {
                const body = getHTMLFromFragment(state.tr.replaceWith(from, to, content).doc.content, schema)
                actions.updateNote(noteId, { body, text: bodyText(body) })
                return
            }

            target.chain().focus().insertContentAt({ from, to }, content).run()
        } finally {
            target.off('transaction', trackPosition)
            if (!target.isDestroyed) setPendingUploads((count) => count - 1)
        }
    }

    const saveDrawing = (file: Promise<File>) => {
        const importing = insertFiles([file], undefined, 'image')
        // The pad displays import errors and keeps the drawing available for retry.
        actions.queueFileImport(importing.catch(() => {}))

        return importing
    }

    const openLink = () => {
        formatting.hide()
        setLinkError('')
        setLink(editor?.getAttributes('link').href || '')
    }

    const applyLink = (event) => {
        event.preventDefault()
        const value = link.trim()
        if (!value) {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
            setLink(null)
            return
        }

        const href = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`
        try {
            if (!['https:', 'http:', 'mailto:'].includes(new URL(href).protocol)) throw new Error()
        } catch {
            setLinkError('Enter a web address or mailto link.')
            return
        }

        if (editor.state.selection.empty && !editor.isActive('link')) {
            editor
                .chain()
                .focus()
                .insertContent({ type: 'text', text: value, marks: [{ type: 'link', attrs: { href } }] })
                .run()
        } else {
            editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
        }
        setLink(null)
    }

    useEffect(() => {
        if (editor && content !== editor.getHTML())
            editor.commands.setContent(content || '<p></p>', { emitUpdate: false })
    }, [content, editor])

    useEffect(() => {
        editor?.setEditable(!disabled, false)
    }, [editor, disabled])

    useEffect(() => {
        if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false))
    }, [editor, tags])

    const formattingControl = editor && !disabled && (
        <Popover
            portal={Portal}
            width={240}
            isVisible={formatting.visible}
            onDismiss={formatting.hide}
            content={
                <MenuBar
                    editor={editor}
                    onLink={openLink}
                    blocks
                />
            }>
            <NoteButton
                round={!!formattingTarget}
                square={!!formattingTarget}
                subtle={!formattingTarget}
                aria-label="Formatting options"
                aria-expanded={formatting.visible}
                active={formatting.visible}
                onMouseDown={(event) => event.preventDefault()}
                onClick={formatting.toggle}>
                Aa
            </NoteButton>
        </Popover>
    )

    return (
        <div className="tiptap-editor__container blot-editor">
            <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                aria-label="Choose files"
                onChange={(event) => {
                    const files = Array.from(event.target.files || [])
                    const kind = event.target.accept ? 'image' : 'attachment'
                    actions.queueFileImport(insertFiles(files, undefined, kind).catch(actions.setError))
                    event.target.value = ''
                }}
            />
            {uploadTarget &&
                !disabled &&
                createPortal(
                    <>
                        {['image', 'upload'].map((icon) => (
                            <NoteButton
                                key={icon}
                                aria-label={icon === 'image' ? 'Add images' : 'Upload files'}
                                disabled={pendingUploads > 0}
                                loading={pendingUploads > 0 && icon === 'upload'}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                    fileInput.current.accept = icon === 'image' ? imageTypes.join(',') : ''
                                    fileInput.current.click()
                                }}>
                                <IconLib icon={icon} />
                            </NoteButton>
                        ))}
                        <NoteButton
                            aria-label="Draw"
                            disabled={pendingUploads > 0}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setDrawing(true)}>
                            <IconLib icon="pencil" />
                        </NoteButton>
                    </>,
                    uploadTarget
                )}
            {drawing && uploadTarget && !disabled && (
                <DrawingModal
                    onSave={saveDrawing}
                    onDismiss={() => {
                        setDrawing(false)
                        if (editor && !editor.isDestroyed) editor.commands.focus()
                    }}
                />
            )}
            <div className="tiptap-editor">
                {editor && !disabled && (
                    <>
                        {formattingTarget ? (
                            createPortal(formattingControl, formattingTarget)
                        ) : (
                            <div className="editor-format-control">{formattingControl}</div>
                        )}
                        <BubbleMenu
                            className="bubble-menu"
                            options={{ offset: 12, flip: true, shift: true }}
                            editor={editor}>
                            <MenuBar
                                editor={editor}
                                onLink={openLink}
                            />
                        </BubbleMenu>
                    </>
                )}
                <EditorContent editor={editor} />
            </div>
            {datePicker && !disabled && (
                <AnchoredPopover
                    target={datePicker.target}
                    initialRect={datePicker.rect}
                    role="dialog"
                    aria-label="Task schedule"
                    id="task-schedule-popover"
                    width="fit-content"
                    onDismiss={() => setDatePicker(null)}
                    content={
                        <DateSelect
                            schedule={datePicker.schedule}
                            onCancel={() => setDatePicker(null)}
                            onSave={(value) => {
                                if (!datePicker.save(value))
                                    actions.setError('This task changed. Reopen its schedule to edit it.')
                                setDatePicker(null)
                            }}
                        />
                    }
                />
            )}
            {link !== null && (
                <div
                    className="link-dialog-backdrop"
                    onMouseDown={() => setLink(null)}>
                    <View
                        as="form"
                        role="dialog"
                        aria-label="Edit link"
                        className="link-dialog"
                        column
                        alignItems="stretch"
                        gap={14}
                        bgToken="surface"
                        p={24}
                        radius="var(--f-radius-xl)"
                        shadow="var(--f-shadow-lg)"
                        onSubmit={applyLink}
                        onMouseDown={stopEvent}>
                        <Text fontWeight={600}>Link</Text>
                        <Input
                            autoFocus
                            aria-label="Link address"
                            placeholder="https://…"
                            value={link}
                            onChange={(event) => setLink(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape') setLink(null)
                            }}
                        />
                        {linkError && (
                            <Text
                                size="sm"
                                colorToken="danger">
                                {linkError}
                            </Text>
                        )}
                        <View
                            row
                            gap={8}
                            justifyContent="flex-end">
                            <Button
                                type="button"
                                subtle
                                onClick={() => setLink(null)}>
                                Cancel
                            </Button>
                            <Button type="submit">{link.trim() ? 'Apply link' : 'Remove link'}</Button>
                        </View>
                    </View>
                </div>
            )}
        </div>
    )
}
