import { Attachment } from '@fold-ui/core'
import { Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { attachmentFile } from '@/helpers/note-files'
import { notesAPI } from '@/hooks/api.hooks'
import { useAppStore } from '@/store/app'

const AttachmentView = ({ node }: NodeViewProps) => {
    const { href, name } = node.attrs

    return (
        <NodeViewWrapper
            as="span"
            title={name}
            contentEditable={false}>
            <Attachment
                as="a"
                size="sm"
                width="fit-content"
                m="0 0.12em"
                href={href}
                label={name}
                onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    notesAPI().openAttachment(href, name).catch(useAppStore.getState().actions.setError)
                }}
            />
        </NodeViewWrapper>
    )
}

export const NoteAttachment = Node.create({
    name: 'attachment',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() {
        return { href: { default: null }, name: { default: '', parseHTML: (element) => element.textContent } }
    },
    parseHTML() {
        return [
            {
                tag: 'a[href]',
                priority: 100,
                getAttrs: (element) => (attachmentFile(element.getAttribute('href') || '') ? {} : false),
            },
        ]
    },
    renderHTML({ node }) {
        return ['a', { href: node.attrs.href }, node.attrs.name]
    },
    renderText({ node }) {
        return node.attrs.name
    },
    addNodeView() {
        return ReactNodeViewRenderer(AttachmentView)
    },
})
