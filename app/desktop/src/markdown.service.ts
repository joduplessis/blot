import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Marked } from 'marked'
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import { bodyText, escapeHtml } from '../../src/helpers/hashtags'
import { attachmentFile, attachmentFilePattern, documentFiles, imageFile } from '../../src/helpers/note-files'
import type { MarkdownImport, Note } from '../../src/types'
import type { NotesService } from './notes.service'

type HtmlNode = DefaultTreeAdapterMap['node']

const attribute = (node: HtmlNode | undefined, name: string) =>
    node && 'attrs' in node ? node.attrs.find((attr) => attr.name === name)?.value || '' : ''
const textContent = (node: HtmlNode): string =>
    'value' in node ? node.value : 'childNodes' in node ? node.childNodes.map(textContent).join('') : ''
const escapeMarkdown = (text: string) =>
    text
        .replace(/\\/g, '\\\\')
        .replace(/([*_\[\]`~])/g, '\\$1')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/^(\s*)(#{1,6}|[-+])(?=\s)/gm, '$1\\$2')
        .replace(/^(\s*\d+)([.)])(?=\s)/gm, '$1\\$2')
const markdownUrl = (url: string) => url.replace(/[\s()<>]/g, (character) => encodeURIComponent(character))

const noteMarkdown = (note: Pick<Note, 'title' | 'body'>, fileFolder: string) => {
    const render = (node: HtmlNode): string => {
        if ('value' in node) return escapeMarkdown(node.value.replace(/\s+/g, ' '))
        if (!('childNodes' in node)) return ''

        const name = 'tagName' in node ? node.tagName : ''
        if (['label', 'input', 'script', 'style'].includes(name)) return ''
        if (name === 'pre') {
            const code = textContent(node).replace(/\n$/, '')
            const fence = '`'.repeat(Math.max(3, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length + 1)))
            const language = attribute(node.childNodes[0], 'class').match(/(?:^|\s)language-(\S+)/)?.[1] || ''

            return `\n\n${fence}${language}\n${code}\n${fence}\n\n`
        }
        if (name === 'code') {
            const code = textContent(node)
            const fence = '`'.repeat(Math.max(1, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length + 1)))

            return `${fence} ${code} ${fence}`
        }
        if (name === 'img') {
            const source = attribute(node, 'src')
            const file = imageFile(source)
            const url = file ? `${encodeURIComponent(fileFolder)}/${file}` : markdownUrl(source)

            return `\n\n![${escapeMarkdown(attribute(node, 'alt'))}](${url})\n\n`
        }
        if (name === 'ul' || name === 'ol') {
            let index = Number(attribute(node, 'start')) || 1
            const items = node.childNodes.filter((child) => 'tagName' in child && child.tagName === 'li')
            const lines = items.map((item) => {
                const task = attribute(item, 'data-type') === 'taskItem'
                const marker = task
                    ? `- [${attribute(item, 'data-checked') === 'true' ? 'x' : ' '}] `
                    : name === 'ol'
                    ? `${index++}. `
                    : '* '
                const content = render(item).trim()

                return marker + content.replace(/\n/g, '\n' + ' '.repeat(task ? 2 : marker.length))
            })

            return '\n\n' + lines.join('\n') + '\n\n'
        }

        const content = node.childNodes.map(render).reduce((result, part) => {
            if (result.endsWith('\n') && part.startsWith('\n')) {
                return result.replace(/\n+$/, '\n\n') + part.replace(/^\n+/, '')
            }

            return result + part
        }, '')
        if (/^h[1-6]$/.test(name)) return `\n\n${'#'.repeat(Number(name[1]))} ${content.trim()}\n\n`
        if (['p', 'div'].includes(name)) return `\n\n${content.trim()}\n\n`
        if (name === 'br') return '  \n'
        if (name === 'hr') return '\n\n---\n\n'
        if (name === 'blockquote') return '\n\n' + content.trim().replace(/^/gm, '> ') + '\n\n'
        if (name === 'a') {
            const href = attribute(node, 'href')
            const file = attachmentFile(href)
            const url = file ? `${encodeURIComponent(fileFolder)}/${file}` : markdownUrl(href)

            return `[${content}](${url})`
        }
        const marker = { strong: '**', b: '**', em: '*', i: '*', s: '~~', del: '~~' }[name]
        if (marker) return content.replace(/^(\s*)([\s\S]*?)(\s*)$/, `$1${marker}$2${marker}$3`)
        if (name === 'u' || name === 'mark') return `<${name}>${content}</${name}>`

        return content
    }
    const body = render(parseFragment(note.body)).trim()

    return `# ${escapeMarkdown(note.title.replace(/[\r\n]+/g, ' ') || 'Untitled note')}\n\n${body}\n`
}

const filename = (title: string) => {
    const name =
        Array.from(title.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-'))
            .slice(0, 60)
            .join('')
            .replace(/^[.\s]+|[.\s]+$/g, '') || 'Untitled note'

    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? '_' + name : name
}

export class MarkdownService {
    constructor(private notes: NotesService) {}

    async export(parent: string) {
        const notes = this.notes.snapshot().notes.filter((note) => !note.encrypted)
        const base = `Blot-notes-${new Date().toISOString().slice(0, 10)}`
        let directory = path.join(parent, base)

        for (let suffix = 2; ; suffix++) {
            try {
                await mkdir(directory)
                break
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
                directory = path.join(parent, `${base} (${suffix})`)
            }
        }

        try {
            const used = new Set(['trash'])

            for (const note of notes) {
                const base = filename(note.title)
                let name = base
                for (let suffix = 2; used.has(name.toLowerCase()) || used.has(name.toLowerCase() + '.md'); suffix++)
                    name = `${base} (${suffix})`
                used.add(name.toLowerCase())
                used.add(name.toLowerCase() + '.md')

                const folder = note.trashedAt ? path.join(directory, 'Trash') : directory
                await mkdir(folder, { recursive: true })
                const files = documentFiles(note.body)
                if (files.length) {
                    await this.notes.files.backup(files, path.join(folder, name))
                }
                await writeFile(path.join(folder, name + '.md'), noteMarkdown(note, name), { flag: 'wx' })
            }
        } catch (error) {
            await rm(directory, { recursive: true, force: true })
            throw error
        }

        return { count: notes.length, directory }
    }

    async import(files: string[]): Promise<MarkdownImport> {
        const notes: Pick<Note, 'title' | 'body'>[] = []
        const missingFiles = new Set<string>()
        const markdown = new Marked({
            breaks: true,
            renderer: {
                html({ text }) {
                    return /^<\/?(?:u|mark|br)\s*\/?>$/i.test(text.trim()) ? text : escapeHtml(text)
                },
                link({ href, tokens }) {
                    const label = this.parser.parseInline(tokens)
                    if (!attachmentFile(href) && !/^(https?:|mailto:)/i.test(href)) return label

                    return `<a href="${escapeHtml(href)}">${label}</a>`
                },
                image({ href, text }) {
                    if (imageFile(href)) return `<img src="${escapeHtml(href)}" alt="${escapeHtml(bodyText(text))}">`
                    if (!/^https?:\/\//i.test(href)) {
                        const label = bodyText(text)

                        return escapeHtml(`[Missing image: ${label ? label + ' - ' : ''}${href}]`)
                    }

                    return `<a href="${escapeHtml(href)}">${escapeHtml(bodyText(text) || href)}</a>`
                },
                list(token) {
                    let html = ''
                    let previous = ''

                    for (const [index, item] of token.items.entries()) {
                        const kind = item.task ? 'task' : token.ordered ? 'ol' : 'ul'
                        if (kind !== previous) {
                            if (previous) html += previous === 'ol' ? '</ol>' : '</ul>'
                            html +=
                                kind === 'task'
                                    ? '<ul data-type="taskList">'
                                    : kind === 'ol'
                                    ? `<ol start="${Number(token.start) + index}">`
                                    : '<ul>'
                            previous = kind
                        }
                        html += this.listitem(item)
                    }

                    return html + (previous === 'ol' ? '</ol>' : '</ul>')
                },
                listitem(item) {
                    const content = this.parser.parse(item.tokens)

                    return item.task
                        ? `<li data-type="taskItem" data-checked="${!!item.checked}">${content}</li>`
                        : `<li>${content}</li>`
                },
            },
        })

        for (const file of files) {
            try {
                if (!/\.(md|markdown)$/i.test(file)) throw new Error('Choose Markdown files (.md or .markdown).')

                const source = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '')
                const tokens = markdown.lexer(source)
                const first = tokens.findIndex((token) => token.type !== 'space')
                const heading = tokens[first]
                let title = path.basename(file, path.extname(file))
                if (heading?.type === 'heading' && heading.depth === 1) {
                    title = bodyText(markdown.parser([heading]))
                    tokens.splice(first, 1)
                }

                const directory = await realpath(path.dirname(file))
                const imported = new Map<string, string>()
                await Promise.all(
                    markdown.walkTokens(tokens, async (token) => {
                        if (token.type !== 'image' && token.type !== 'link') return
                        if (/^https?:\/\//i.test(token.href)) return

                        // Only treat Blot's exported file links as attachments.
                        const attachment = token.type === 'link'
                        if (attachment && !attachmentFilePattern.test(path.basename(token.href))) return
                        if (/^[a-z][a-z\d+.-]*:|^[/\\]/i.test(token.href))
                            throw new Error('Files must be in the Markdown file’s folder.')

                        let source = imported.get(token.type + token.href)
                        if (!source) {
                            let data: Buffer

                            try {
                                const local = await realpath(path.resolve(directory, decodeURIComponent(token.href)))
                                if (!local.startsWith(directory + path.sep))
                                    throw new Error('Files must be in the Markdown file’s folder.')
                                if ((await stat(local)).size > 25 * 1024 * 1024)
                                    throw new Error('Choose a file of 25 MB or less.')

                                data = await readFile(local)
                            } catch (error) {
                                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error

                                missingFiles.add(`${path.basename(file)}: ${token.href}`)
                                return
                            }

                            source = await this.notes.files.import(data, attachment ? token.text : undefined)
                            imported.set(token.type + token.href, source)
                        }
                        token.href = source
                    })
                )
                notes.push({ title, body: markdown.parser(tokens) })
            } catch (error) {
                throw new Error(`${path.basename(file)}: ${(error as Error).message}`)
            }
        }

        return { ...this.notes.importNotes(notes), missingImages: [...missingFiles] }
    }
}
