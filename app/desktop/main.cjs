const {
    app,
    BrowserWindow,
    ipcMain,
    protocol,
    net,
    dialog,
    shell,
    Menu,
    powerMonitor,
    nativeTheme,
} = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { NotesService } = require('./dist/notes.service.cjs')
const { FolderSyncService } = require('./dist/folder-sync.service.cjs')
const { MarkdownService } = require('./dist/markdown.service.cjs')

const development =
    process.env.BLOT_DEV === '1' ||
    process.env.WILSON_DEV === '1' ||
    process.env.KRAKO_DEV === '1' ||
    process.env.KRAKEN_DEV === '1' ||
    process.env.NOTED_DEV === '1'
const rendererDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'renderer')
    : path.join(__dirname, '../dist')
const iconPath = app.isPackaged
    ? path.join(rendererDirectory, 'blot.png')
    : path.join(__dirname, '../public/blot.png')
const appUrl = development ? 'http://127.0.0.1:4318' : 'noted://app/index.html'
let mainWindow
let service
let folderSync
let syncInterval
let closeReady = false
let closeRequested = false
let quitting = false

app.setName('Blot')
// Preserve the existing database, Chromium preferences, and application identity on rename.
app.setPath(
    'userData',
    process.env.BLOT_DATA_DIR ||
        process.env.WILSON_DATA_DIR ||
        process.env.KRAKO_DATA_DIR ||
        process.env.KRAKEN_DATA_DIR ||
        process.env.NOTED_DATA_DIR ||
        (app.isPackaged ? path.join(app.getPath('appData'), 'Noted') : path.join(__dirname, '.data'))
)
protocol.registerSchemesAsPrivileged([
    { scheme: 'noted', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const trusted = (event) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return false
    const url = new URL(event.senderFrame.url)
    return development ? url.origin === 'http://127.0.0.1:4318' : url.protocol === 'noted:' && url.hostname === 'app'
}

const openExternal = async (value) => {
    const url = new URL(value)
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error('This link type is not supported.')
    await shell.openExternal(url.toString())
}

const createWindow = () => {
    closeReady = false
    closeRequested = false
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 940,
        minWidth: 900,
        minHeight: 620,
        title: 'Blot',
        icon: iconPath,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 14 } : undefined,
        backgroundColor: '#faf9f6',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    })
    mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        openExternal(url).catch(() => {})
        return { action: 'deny' }
    })
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url.split('#')[0] !== appUrl) event.preventDefault()
    })
    mainWindow.on('close', (event) => {
        if (closeReady) return
        event.preventDefault()
        if (closeRequested) return
        closeRequested = true
        mainWindow.webContents.send('blot:before-close')
    })
    mainWindow.on('closed', () => {
        service.lock()
        mainWindow = null
    })
    mainWindow.on('focus', () => folderSync?.request())
    mainWindow.loadURL(appUrl)
}

if (!app.requestSingleInstanceLock()) {
    app.quit()
} else {
    app.on('second-instance', () => {
        if (mainWindow?.isMinimized()) mainWindow.restore()
        mainWindow?.focus()
    })

    app.whenReady()
        .then(() => {
            protocol.handle('noted', (request) => {
                const url = new URL(request.url)
                if (url.hostname === 'images') {
                    try {
                        return net.fetch(pathToFileURL(service.files.imagePath(url.pathname.slice(1))).toString())
                    } catch {
                        return new Response('Not found', { status: 404 })
                    }
                }
                const file = path.resolve(rendererDirectory, '.' + decodeURIComponent(url.pathname))
                if (url.hostname !== 'app' || !file.startsWith(rendererDirectory + path.sep))
                    return new Response('Not found', { status: 404 })
                return net.fetch(pathToFileURL(file).toString())
            })
            service = new NotesService(app.getPath('userData'))
            const requestLock = () => {
                service.hidePrivateNotes()
                mainWindow?.webContents.send('blot:lock-request')
                if (!mainWindow) service.lock()
            }
            powerMonitor.on('suspend', requestLock)
            const markdown = new MarkdownService(service)
            folderSync = new FolderSyncService(service, app.getPath('userData'), () => {
                if (!closeRequested) mainWindow?.webContents.send('blot:sync-request')
            })
            syncInterval = setInterval(() => folderSync.request(), 30000)
            const methods = [
                'snapshot',
                'createNote',
                'updateNote',
                'deleteNote',
                'saveTag',
                'deleteTag',
                'setPin',
                'clearPin',
                'unlock',
                'lock',
                'setNoteEncrypted',
            ]
            const handlers = Object.fromEntries(
                methods.map((method) => [
                    method,
                    (...args) => {
                        const result = service[method](...args)
                        if (method !== 'snapshot') folderSync.request()
                        return result
                    },
                ])
            )
            handlers.prepareLock = () => service.hidePrivateNotes()
            handlers.backup = async () => {
                const result = await dialog.showSaveDialog(mainWindow, {
                    title: 'Back up Blot',
                    defaultPath: `Blot-${new Date().toISOString().slice(0, 10)}.sqlite`,
                    filters: [{ name: 'SQLite database', extensions: ['sqlite'] }],
                })
                return result.canceled ? null : service.backup(result.filePath)
            }
            handlers.importImage = (data, noteId) => service.importFile(data, noteId)
            handlers.importAttachment = (data, noteId, name) => service.importFile(data, noteId, name)
            handlers.openAttachment = async (source, name) => {
                const file = await service.files.attachmentCopy(source, name)
                const error = await shell.openPath(file)
                if (error) throw new Error(error)
            }
            handlers.exportMarkdown = async () => {
                const result = await dialog.showOpenDialog(mainWindow, {
                    title: 'Export all notes as Markdown',
                    buttonLabel: 'Export here',
                    defaultPath: app.getPath('downloads'),
                    properties: ['openDirectory', 'createDirectory'],
                })

                return result.canceled ? null : markdown.export(result.filePaths[0])
            }
            handlers.importMarkdown = async () => {
                const result = await dialog.showOpenDialog(mainWindow, {
                    title: 'Import Markdown files',
                    buttonLabel: 'Import',
                    filters: [{ name: 'Markdown files', extensions: ['md', 'markdown'] }],
                    properties: ['openFile', 'multiSelections'],
                })
                if (result.canceled) return null

                const imported = await markdown.import(result.filePaths)
                folderSync.request()

                return imported
            }
            handlers.syncStatus = () => folderSync.status()
            handlers.syncNow = () => folderSync.sync()
            handlers.disconnectSync = () => folderSync.disconnect()
            handlers.chooseSyncFolder = async () => {
                const result = await dialog.showOpenDialog(mainWindow, {
                    title: 'Choose a Blot sync folder',
                    buttonLabel: 'Use sync folder',
                    properties: ['openDirectory', 'createDirectory'],
                })
                return result.canceled ? folderSync.status() : folderSync.connect(result.filePaths[0])
            }
            handlers.openExternal = openExternal
            handlers.setWindowTheme = (theme) => {
                if (process.platform !== 'darwin' || (theme !== 'light' && theme !== 'dark')) return

                nativeTheme.themeSource = theme
            }
            for (const [method, handler] of Object.entries(handlers)) {
                ipcMain.handle('blot:' + method, (event, ...args) => {
                    if (!trusted(event)) throw new Error('Untrusted application window.')
                    return handler(...args)
                })
            }
            ipcMain.on('blot:close-ready', (event, saved) => {
                if (!trusted(event) || !closeRequested) return
                closeRequested = false
                if (!saved) {
                    quitting = false
                    dialog.showMessageBox(mainWindow, {
                        type: 'error',
                        message: 'Your latest edits could not be saved.',
                        detail: 'Blot will stay open. Retry saving before closing.',
                        buttons: ['Keep writing'],
                    })
                    return
                }
                closeReady = true
                if (quitting) app.quit()
                else mainWindow.close()
            })
            Menu.setApplicationMenu(
                Menu.buildFromTemplate([
                    ...(process.platform === 'darwin'
                        ? [
                              {
                                  label: 'Blot',
                                  submenu: [
                                      { role: 'about' },
                                      { type: 'separator' },
                                      { role: 'hide' },
                                      { role: 'quit' },
                                  ],
                              },
                          ]
                        : []),
                    {
                        label: 'File',
                        submenu: [
                            {
                                label: 'Back up notes…',
                                click: () => mainWindow?.webContents.send('blot:backup'),
                            },
                        ],
                    },
                    { role: 'editMenu' },
                    {
                        label: 'View',
                        submenu: [
                            { role: 'reload' },
                            { role: 'toggleDevTools' },
                            { type: 'separator' },
                            { role: 'resetZoom' },
                            { role: 'zoomIn' },
                            { role: 'zoomOut' },
                            { role: 'togglefullscreen' },
                        ],
                    },
                    { role: 'windowMenu' },
                ])
            )
            createWindow()
            app.on('activate', () => {
                if (!mainWindow) createWindow()
            })
        })
        .catch((error) => {
            dialog.showErrorBox('Blot could not start', error.message)
            app.quit()
        })
}

app.on('before-quit', () => {
    quitting = true
})
app.on('will-quit', () => {
    clearInterval(syncInterval)
    folderSync?.close()
    service?.close()
})
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
