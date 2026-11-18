import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'

export const imageFilePattern = /^[a-f0-9]{64}\.(png|jpg|gif|webp)$/
export const attachmentFilePattern = /^[a-f0-9]{64}\.attachment(?:\.[a-z0-9]{1,16})?$/
export const imageSource = (file: string) => `noted://images/${file}`
export const attachmentSource = (file: string) => `noted://attachments/${file}`

export const imageFile = (source: string): string | null => {
    const file = source.startsWith('noted://images/') ? source.slice(15) : ''

    return imageFilePattern.test(file) ? file : null
}

export const attachmentFile = (source: string): string | null => {
    const file = source.startsWith('noted://attachments/') ? source.slice('noted://attachments/'.length) : ''

    return attachmentFilePattern.test(file) ? file : null
}

export const documentFiles = (body: string, includeAttachments = true): string[] => {
    const files = new Set<string>()
    const visit = (node: DefaultTreeAdapterMap['node']) => {
        if ('tagName' in node) {
            const attr = (name: string) => node.attrs.find((attr) => attr.name === name)?.value || ''
            const file =
                node.tagName === 'img'
                    ? imageFile(attr('src'))
                    : includeAttachments && node.tagName === 'a'
                    ? attachmentFile(attr('href'))
                    : null
            if (file) files.add(file)
        }
        if ('childNodes' in node) node.childNodes.forEach(visit)
    }
    visit(parseFragment(body))

    return [...files]
}

export const documentImages = (body: string) => documentFiles(body, false)
export const hasNoteFiles = (body: string) =>
    /<img\b/i.test(body) || (/<a\b/i.test(body) && documentFiles(body).length > 0)
