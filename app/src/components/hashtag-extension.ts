import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node } from '@tiptap/pm/model'
import { findHashtags, hashtagPath, pathKey } from '@/helpers/hashtags'
import { useAppStore } from '@/store/app'

const decorations = (doc: Node) => {
    const tags = useAppStore.getState().tags
    const byPath = new Map(tags.map((tag) => [pathKey(hashtagPath(tags, tag)), tag]))
    const ranges: Decoration[] = []
    doc.descendants((node, position) => {
        if (node.type.spec.code) return false
        if (!node.isTextblock) return
        let text = ''
        node.forEach((child) => {
            const excluded = !child.isText || child.marks.some((mark) => ['code', 'link'].includes(mark.type.name))
            text += excluded ? '\n'.repeat(child.nodeSize) : child.text
        })
        for (const match of findHashtags(text)) {
            const tag = byPath.get(pathKey(match.path))
            ranges.push(
                Decoration.inline(position + 1 + match.from, position + 1 + match.to, {
                    class: 'inline-hashtag',
                    ...(tag?.color ? { style: `--hashtag-color: ${tag.color}` } : {}),
                })
            )
        }
        return false
    })
    return DecorationSet.create(doc, ranges)
}

// Decorations keep hashtags as ordinary editable text, including undo and paste.
export const Hashtags = Extension.create({
    name: 'hashtags',
    addProseMirrorPlugins() {
        return [new Plugin({ props: { decorations: (state) => decorations(state.doc) } })]
    },
})
