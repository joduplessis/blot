import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5'
import type { Note, NoteChanges, Tag } from '../types'

type HtmlNode = DefaultTreeAdapterMap['node']
type TextNode = DefaultTreeAdapterMap['textNode']
export type Hashtag = { from: number; to: number; path: string }

export const pathKey = (path: string) => path.normalize('NFC').toLowerCase()
export const hashtagPath = (tags: Tag[], tag: Tag): string => {
    const parent = tags.find((item) => item.id === tag.parentId)
    return parent ? `${hashtagPath(tags, parent)}/${tag.text}` : tag.text
}

export const formatHashtag = (path: string) =>
    /^[\p{L}\p{N}_][\p{L}\p{M}\p{N}_-]*(?:\/[\p{L}\p{N}_][\p{L}\p{M}\p{N}_-]*)*$/u.test(path) ? `#${path}` : `#${path}#`

export const findHashtags = (text: string): Hashtag[] => {
    const pattern =
        /(?<![\p{L}\p{M}\p{N}_/#\\])#(?:([^\s#](?:[^#\n]*[^\s#])?)#(?=$|[^\p{L}\p{M}\p{N}_/#])|([\p{L}\p{N}_][\p{L}\p{M}\p{N}_-]*(?:\/[\p{L}\p{N}_][\p{L}\p{M}\p{N}_-]*)*))/gu
    const matches: Hashtag[] = []
    for (const match of text.matchAll(pattern)) {
        const path = match[1] || match[2]
        if (path.split('/').some((part) => !part.trim() || part !== part.trim())) continue
        matches.push({ from: match.index!, to: match.index! + match[0].length, path })
    }
    return matches
}

const blocks = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'blockquote', 'pre'])
const excluded = new Set(['code', 'pre', 'a', 'script', 'style'])

// Join adjacent formatted text so a hashtag can cross bold/italic boundaries.
const textGroups = (root: HtmlNode): TextNode[][] => {
    const groups: TextNode[][] = []
    let group: TextNode[] = []
    const flush = () => {
        if (group.length) groups.push(group)
        group = []
    }
    const visit = (node: HtmlNode) => {
        if (node.nodeName === '#text') {
            group.push(node as TextNode)
            return
        }
        const name = 'tagName' in node ? node.tagName : ''
        if (excluded.has(name)) {
            flush()
            return
        }
        const boundary = blocks.has(name) || ['br', 'hr', 'img'].includes(name)
        if (boundary) flush()
        if ('childNodes' in node) node.childNodes.forEach(visit)
        if (boundary) flush()
    }
    visit(root)
    flush()
    return groups
}

export const documentTagPaths = (title: string, body: string): string[] => {
    const texts = [title, ...textGroups(parseFragment(body)).map((nodes) => nodes.map((node) => node.value).join(''))]
    return [...new Map(texts.flatMap(findHashtags).map(({ path }) => [pathKey(path), path])).values()]
}

export const bodyText = (body: string): string => {
    const visit = (node: HtmlNode): string => {
        if (node.nodeName === '#text') return (node as TextNode).value
        const name = 'tagName' in node ? node.tagName : ''
        if (['script', 'style'].includes(name)) return ''
        if (name === 'br') return '\n'
        const text = 'childNodes' in node ? node.childNodes.map(visit).join('') : ''
        return blocks.has(name) ? `${text}\n\n` : text
    }
    return visit(parseFragment(body)).trim()
}

const renameText = (text: string, paths: Map<string, string>) => {
    for (const match of findHashtags(text).reverse()) {
        const path = paths.get(pathKey(match.path))
        if (path !== undefined) text = text.slice(0, match.from) + formatHashtag(path) + text.slice(match.to)
    }
    return text
}

export const renamedPaths = (before: Tag[], after: Tag[]) => {
    const paths = new Map<string, string>()
    for (const tag of before) {
        const saved = after.find((item) => item.id === tag.id)
        if (!saved) continue
        const oldPath = hashtagPath(before, tag)
        const newPath = hashtagPath(after, saved)
        if (oldPath !== newPath) paths.set(pathKey(oldPath), newPath)
    }
    return paths
}

export const renameDocumentHashtags = (note: Pick<Note, 'title' | 'body'>, paths: Map<string, string>): NoteChanges => {
    if (!paths.size) return {}
    const title = renameText(note.title, paths)
    const root = parseFragment(note.body)
    let changed = false
    for (const nodes of textGroups(root)) {
        const text = nodes.map((node) => node.value).join('')
        const ranges = nodes.map((node, index) => ({
            node,
            from: nodes.slice(0, index).reduce((sum, previous) => sum + previous.value.length, 0),
            length: node.value.length,
        }))
        for (const match of findHashtags(text).reverse()) {
            const path = paths.get(pathKey(match.path))
            if (path === undefined) continue
            const replacement = formatHashtag(path)
            if (replacement === text.slice(match.from, match.to)) continue
            changed = true
            for (const { node, from, length } of ranges) {
                if (from >= match.to || from + length <= match.from) continue
                const start = Math.max(0, match.from - from)
                const end = Math.min(length, match.to - from)
                node.value =
                    node.value.slice(0, start) + (from <= match.from ? replacement : '') + node.value.slice(end)
            }
        }
    }
    const body = changed ? serialize(root) : note.body
    return {
        ...(title !== note.title ? { title } : {}),
        ...(changed ? { body, text: bodyText(body) } : {}),
    }
}

export const escapeHtml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
