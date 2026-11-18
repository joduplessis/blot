const { contextBridge, ipcRenderer } = require('electron')
const methods = [
    'snapshot',
    'setPin',
    'clearPin',
    'unlock',
    'lock',
    'prepareLock',
    'setNoteEncrypted',
    'createNote',
    'updateNote',
    'deleteNote',
    'saveTag',
    'deleteTag',
    'backup',
    'exportMarkdown',
    'importMarkdown',
    'importImage',
    'importAttachment',
    'openAttachment',
    'openExternal',
    'setWindowTheme',
    'syncStatus',
    'chooseSyncFolder',
    'disconnectSync',
    'syncNow',
]
const api = Object.fromEntries(
    methods.map((method) => [method, (...args) => ipcRenderer.invoke('blot:' + method, ...args)])
)

api.onBeforeClose = (callback) => {
    const listener = async () => {
        try {
            await callback()
            ipcRenderer.send('blot:close-ready', true)
        } catch {
            ipcRenderer.send('blot:close-ready', false)
        }
    }
    ipcRenderer.on('blot:before-close', listener)
    return () => ipcRenderer.removeListener('blot:before-close', listener)
}

api.onBackup = (callback) => {
    const listener = () => callback()
    ipcRenderer.on('blot:backup', listener)
    return () => ipcRenderer.removeListener('blot:backup', listener)
}

api.onSyncRequest = (callback) => {
    const listener = () => callback()
    ipcRenderer.on('blot:sync-request', listener)
    return () => ipcRenderer.removeListener('blot:sync-request', listener)
}

api.onLockRequest = (callback) => {
    const listener = () => callback()
    ipcRenderer.on('blot:lock-request', listener)
    return () => ipcRenderer.removeListener('blot:lock-request', listener)
}

contextBridge.exposeInMainWorld('blot', api)
