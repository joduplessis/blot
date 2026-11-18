import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
    attachmentFile,
    attachmentFilePattern,
    attachmentSource,
    imageFilePattern,
    imageSource,
} from '../../src/helpers/note-files'

export class NoteFilesService {
    private readonly directory: string

    constructor(directory: string) {
        this.directory = path.join(directory, 'images')
    }

    private filePath(file: string, directory = this.directory) {
        if (!imageFilePattern.test(file) && !attachmentFilePattern.test(file))
            throw new Error('Invalid file reference.')

        return path.join(directory, file)
    }

    imagePath(file: string) {
        if (!imageFilePattern.test(file)) throw new Error('Invalid image reference.')

        return this.filePath(file)
    }

    private identify(data: Uint8Array, attachmentSuffix?: string) {
        if (!(data instanceof Uint8Array) || data.length > 25 * 1024 * 1024)
            throw new Error('Choose a file of 25 MB or less.')

        const hash = createHash('sha256').update(data).digest('hex')
        if (attachmentSuffix) return hash + attachmentSuffix

        const header = Buffer.from(data.subarray(0, 12))
        const extension = header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
            ? 'png'
            : header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
            ? 'jpg'
            : ['GIF87a', 'GIF89a'].includes(header.toString('ascii', 0, 6))
            ? 'gif'
            : header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP'
            ? 'webp'
            : null
        if (!extension) throw new Error('Choose a PNG, JPEG, GIF, or WebP image.')

        return hash + '.' + extension
    }

    private async write(file: string, data: Uint8Array, directory = this.directory) {
        await mkdir(directory, { recursive: true })
        const temporary = path.join(directory, '.' + randomUUID() + '.tmp')

        try {
            await writeFile(temporary, data, { flag: 'wx' })
            await rename(temporary, this.filePath(file, directory))
        } finally {
            await unlink(temporary).catch(() => {})
        }
    }

    async import(data: Uint8Array, attachmentName?: string) {
        const extension = attachmentName?.match(/\.([a-z0-9]{1,16})$/i)?.[0].toLowerCase() || ''
        const file = this.identify(data, attachmentName === undefined ? undefined : '.attachment' + extension)
        await this.write(file, data)

        return attachmentName === undefined ? imageSource(file) : attachmentSource(file)
    }

    async attachmentCopy(source: string, name: string) {
        const file = attachmentFile(source)
        if (!file) throw new Error('Invalid attachment reference.')

        // Open a working copy so external editors cannot change a note or its history.
        const safeName = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[.\s]+$/g, '')
        const filename = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safeName) ? '_' + safeName : safeName
        const directory = await mkdtemp(path.join(tmpdir(), 'blot-'))
        const destination = path.join(directory, filename || file)
        await copyFile(this.filePath(file), destination)

        return destination
    }

    private async exists(file: string, directory: string) {
        try {
            return (await stat(this.filePath(file, directory))).isFile()
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
            throw error
        }
    }

    private async copy(file: string, from: string, to: string) {
        const source = this.filePath(file, from)
        if ((await stat(source)).size > 25 * 1024 * 1024) throw new Error('A synced file exceeds 25 MB.')

        const data = await readFile(source)
        const suffix = attachmentFilePattern.test(file) ? file.slice(file.indexOf('.')) : undefined
        if (this.identify(data, suffix) !== file) throw new Error('A synced file is incomplete or has been modified.')

        await this.write(file, data, to)
    }

    async exchange(files: string[], folder: string): Promise<Set<string>> {
        const directory = path.join(folder, 'images')
        const available = new Set<string>()

        for (const file of files) {
            const local = await this.exists(file, this.directory)
            const remote = await this.exists(file, directory)
            if (!local && !remote) continue
            if (!local) await this.copy(file, directory, this.directory)
            if (!remote) await this.copy(file, this.directory, directory)
            available.add(file)
        }

        return available
    }

    async backup(files: string[], directory: string) {
        for (const file of files) await this.copy(file, this.directory, directory)
    }
}
