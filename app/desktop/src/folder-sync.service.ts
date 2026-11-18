import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { NotesService } from './notes.service'
import { parseRecord, type SyncRecord, type SyncNote } from './sync-record'
import { documentFiles } from '../../src/helpers/note-files'
import type { SyncResult, SyncStatus } from '../../src/types'

// Keep the on-disk marker and app identifier compatible with existing sync folders.
const marker = 'kraken-sync.json'

export class FolderSyncService {
    private watcher?: FSWatcher
    private timer?: ReturnType<typeof setTimeout>
    private running?: Promise<SyncResult>
    private error = ''
    private waiting = 0
    private locked = false

    constructor(private notes: NotesService, private dataDirectory: string, private requestSync: () => void) {
        this.watchFolder()
    }

    status(): SyncStatus {
        return { ...this.notes.syncSettings(), error: this.error, waiting: this.waiting, locked: this.locked }
    }

    request() {
        if (!this.notes.syncSettings().folder) return

        clearTimeout(this.timer)
        this.timer = setTimeout(this.requestSync, 750)
    }

    private watchFolder() {
        this.watcher?.close()
        this.watcher = undefined
        const { folder } = this.notes.syncSettings()
        if (!folder) return

        try {
            this.watcher = watch(path.join(folder, 'changes'), () => this.request())
            this.watcher.on('error', () => {
                this.watcher?.close()
                this.watcher = undefined
                this.request()
            })
        } catch {
            // The next foreground or periodic sync retries an unavailable folder.
        }
    }

    async connect(directory: string): Promise<SyncStatus> {
        if (this.running) await this.running
        const folder = await realpath(directory)
        const local = await realpath(this.dataDirectory)
        const contains = (parent: string, child: string) => {
            const relative = path.relative(parent, child)
            return (
                !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
            )
        }
        if (contains(folder, local) || contains(local, folder)) {
            throw new Error('Choose a dedicated sync folder outside Blot’s local data folder.')
        }

        const entries = await readdir(folder)
        if (entries.includes(marker)) {
            await this.checkFolder(folder)
        } else {
            const ignored = new Set(['.DS_Store', 'desktop.ini', 'Thumbs.db'])
            if (entries.some((entry) => !ignored.has(entry))) {
                throw new Error('Choose an empty folder, or the Blot sync folder already used on your other computer.')
            }
            // The marker has no device-specific data, so simultaneous first connections are compatible.
            await writeFile(path.join(folder, marker), JSON.stringify({ app: 'Kraken', format: 1 }) + '\n', {
                flag: 'wx',
            }).catch(async (error) => {
                if (error.code !== 'EEXIST') throw error
                await this.checkFolder(folder)
            })
        }
        await mkdir(path.join(folder, 'changes'), { recursive: true })
        this.notes.setSyncFolder(folder)
        this.error = ''
        this.waiting = 0
        this.watchFolder()

        return this.status()
    }

    async disconnect(): Promise<SyncStatus> {
        if (this.running) await this.running

        this.notes.setSyncFolder(null)
        this.locked = false
        this.error = ''
        this.waiting = 0
        clearTimeout(this.timer)
        this.watchFolder()

        return this.status()
    }

    private async checkFolder(folder: string) {
        const value = JSON.parse(await readFile(path.join(folder, marker), 'utf8'))
        if (value.app !== 'Kraken' || value.format !== 1)
            throw new Error('This sync folder uses an unsupported Blot format.')
    }

    sync(): Promise<SyncResult> {
        if (this.running) return this.running

        this.running = this.exchange().finally(() => {
            this.running = undefined
        })
        return this.running
    }

    private async exchange(): Promise<SyncResult> {
        const { folder } = this.notes.syncSettings()
        if (!folder) return { status: this.status() }
        let changed = false

        try {
            await this.checkFolder(folder)
            const directory = path.join(folder, 'changes')
            if (!(await stat(directory)).isDirectory()) throw new Error('The sync changes folder is unavailable.')
            const files = await readdir(directory)
            const local = this.notes.syncRecords()
            const known = new Set(local.map((record) => record.id))
            const incoming: SyncRecord[] = []

            for (const file of files) {
                if (!file.endsWith('.json') || known.has(file.slice(0, -5))) continue
                const record = parseRecord(await readFile(path.join(directory, file), 'utf8'))
                incoming.push(record)
            }
            this.locked = !this.notes.prepareSync(incoming)
            if (this.locked) {
                this.error = ''
                return { status: this.status(), snapshot: this.notes.snapshot() }
            }

            const noteFiles = (record: SyncRecord) =>
                record.encryption
                    ? record.encryption.images
                    : record.key.startsWith('note/') && record.value
                    ? documentFiles((record.value as SyncNote).body)
                    : []
            const available = await this.notes.files.exchange(
                [...new Set([...local, ...incoming].flatMap(noteFiles))],
                folder
            )
            const ready = incoming.filter((record) => noteFiles(record).every((file) => available.has(file)))

            // Revisions wait for both their files and parent history to arrive.
            const result = this.notes.importRecords(ready)
            changed = result.changed
            this.waiting = result.waiting + incoming.length - ready.length
            const present = new Set(files)

            for (const record of this.notes.syncRecords()) {
                if (noteFiles(record).some((file) => !available.has(file)))
                    throw new Error('A local file is missing. Restore it from a backup or your sync folder.')
                const filename = record.id + '.json'
                if (present.has(filename)) continue
                const temporary = path.join(directory, '.' + randomUUID() + '.tmp')

                try {
                    await writeFile(temporary, JSON.stringify(record) + '\n', { flag: 'wx' })
                    await rename(temporary, path.join(directory, filename))
                } finally {
                    await unlink(temporary).catch(() => {})
                }
            }
            this.error = ''
            if (!this.waiting) this.notes.syncCompleted()
            if (!this.watcher) this.watchFolder()
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            this.error =
                code === 'ENOENT'
                    ? 'Sync folder unavailable. Check that your sync app is running and the folder is available offline.'
                    : code === 'EACCES' || code === 'EPERM'
                    ? 'Blot cannot access the sync folder. Check its permissions and try again.'
                    : error instanceof Error
                    ? error.message
                    : String(error)
        }

        return { status: this.status(), ...(changed ? { snapshot: this.notes.snapshot() } : {}) }
    }

    close() {
        clearTimeout(this.timer)
        this.watcher?.close()
    }
}
