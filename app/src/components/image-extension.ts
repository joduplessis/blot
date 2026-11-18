import { Node, mergeAttributes } from '@tiptap/core'
import { imageFile } from '@/helpers/note-files'

export const NoteImage = Node.create({
    name: 'image',
    group: 'block',
    draggable: true,
    atom: true,
    addAttributes() {
        return { src: { default: null }, alt: { default: '' } }
    },
    parseHTML() {
        return [{ tag: 'img[src]', getAttrs: (element) => (imageFile(element.getAttribute('src') || '') ? {} : false) }]
    },
    renderHTML({ HTMLAttributes }) {
        return ['img', mergeAttributes(HTMLAttributes)]
    },
})
