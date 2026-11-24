import {
    Button,
    Divider,
    Heading,
    IconLib,
    Modal,
    ModalClose,
    Portal,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    Tabs,
    Text,
    View,
} from '@fold-ui/core'
import { useState } from 'react'
import { useAppStore } from '@/store/app'
import { PinModal } from './pin.modal'
import { errorText } from '@/hooks/api.hooks'
import { releaseDate, version } from '../../desktop/package.json'

const released = new Date(releaseDate).toLocaleDateString(undefined, { dateStyle: 'long', timeZone: 'UTC' })

export const SettingsModal = ({ onDismiss }: { onDismiss: () => void }) => {
    const pinSet = useAppStore((state) => state.privacy.pinSet)
    const [pinMode, setPinMode] = useState<'add' | 'clear' | null>(null)
    const sync = useAppStore((state) => state.sync)
    const syncing = useAppStore((state) => state.syncing)
    const actions = useAppStore((state) => state.actions)
    const [tab, setTab] = useState(1)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [transferError, setTransferError] = useState('')
    const [transferStatus, setTransferStatus] = useState('')
    const [transferWarning, setTransferWarning] = useState('')
    const message = error || sync?.error
    const status = syncing
        ? 'Syncing…'
        : message
        ? 'Sync needs attention'
        : sync?.locked
        ? 'Unlock Blot to sync protected notes'
        : sync?.waiting
        ? 'Waiting for changes from your sync app…'
        : sync?.lastSync
        ? `Last synced ${new Date(sync.lastSync).toLocaleString()}`
        : sync?.folder
        ? 'Ready to sync'
        : 'Sync is off'

    const handleAction = async (action: () => Promise<void>) => {
        setBusy(true)
        setError('')

        try {
            await action()
        } catch (error) {
            setError(errorText(error))
        } finally {
            setBusy(false)
        }
    }

    const handleTransfer = async (importing: boolean) => {
        setBusy(true)
        setTransferError('')
        setTransferWarning('')
        setTransferStatus(importing ? 'Importing notes…' : 'Exporting notes…')

        try {
            if (importing) {
                const result = await actions.importMarkdown()
                if (!result) {
                    setTransferStatus('')
                    return
                }

                const { count, missingImages: missingFiles } = result
                setTransferStatus(`Imported ${count} ${count === 1 ? 'note' : 'notes'}.`)
                if (missingFiles.length) {
                    setTransferWarning(
                        [
                            `${missingFiles.length} ${
                                missingFiles.length === 1 ? 'file could' : 'files could'
                            } not be found. Their references were kept in the notes.`,
                            missingFiles.join('\n'),
                        ].join('\n\n')
                    )
                }
            } else {
                const result = await actions.exportMarkdown()
                setTransferStatus(
                    result
                        ? `Exported ${result.count} ${result.count === 1 ? 'note' : 'notes'} to ${result.directory}`
                        : ''
                )
            }
        } catch (error) {
            setTransferStatus('')
            setTransferError(errorText(error))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal
            disableBackgroundDismiss
            width={900}
            height="85%"
            bodyProps={{ style: { minHeight: 0 } }}
            style={{ maxWidth: '95%', maxHeight: 740 }}
            className="settings-modal"
            role="dialog"
            aria-label="Settings"
            anchor="middle-center"
            portal={Portal}
            onDismiss={onDismiss}
            isVisible>
            <ModalClose
                aria-label="Close settings"
                onClick={onDismiss}
            />
            <Tabs
                selected={tab}
                onSelect={setTab}
                layout="left">
                <TabList>
                    <Heading>Settings</Heading>
                    <Tab prefix={<IconLib icon="cloud" />}>Sync</Tab>
                    <Tab prefix={<IconLib icon="markdown" />}>Import / Export</Tab>
                    <Tab prefix={<IconLib icon="lock" />}>Privacy</Tab>
                    <Tab prefix={<IconLib icon="octopus" />}>About</Tab>
                </TabList>
                <TabPanels>
                    {/* The Settings heading occupies the first TabList slot. */}
                    <TabPanel />
                    <TabPanel>
                        <View className="f-overflow-y-auto f-scrollbar settings-panel">
                            <Heading
                                as="h4"
                                m="1rem 0 1.5rem"
                                fontWeight="var(--f-font-weight-bold)">
                                Sync
                            </Heading>
                            <Text colorToken="text-weak">
                                Keep your notes with you across macOS, Windows, and Linux. Choose a dedicated folder
                                inside Dropbox or another file-sync app, then choose that same synced folder on each
                                computer.
                            </Text>
                            <Divider />
                            <View
                                column
                                gap="0.75rem"
                                alignItems="flex-start">
                                <Text fontWeight="var(--f-font-weight-semibold)">Sync folder</Text>
                                <Text
                                    colorToken="text-weak"
                                    style={{ overflowWrap: 'anywhere' }}>
                                    {sync?.folder || 'No folder selected. Your notes are saved on this computer.'}
                                </Text>
                                <Button
                                    size="sm"
                                    disabled={busy || syncing}
                                    prefix={
                                        <IconLib
                                            icon="folder"
                                            size="sm"
                                        />
                                    }
                                    onClick={() => handleAction(actions.chooseSyncFolder)}>
                                    {sync?.folder ? 'Change folder…' : 'Choose folder…'}
                                </Button>
                            </View>
                            <View
                                column
                                gap="0.75rem"
                                alignItems="flex-start">
                                <Text
                                    role="status"
                                    aria-live="polite"
                                    colorToken="text-weak">
                                    {status}
                                </Text>
                                {!!message && (
                                    <Text
                                        role="alert"
                                        colorToken="red-500">
                                        {message}
                                    </Text>
                                )}
                                {!!sync?.folder && (
                                    <View
                                        row
                                        gap="0.75rem"
                                        justifyContent="flex-start"
                                        wrap="wrap">
                                        <Button
                                            size="sm"
                                            disabled={busy || syncing}
                                            prefix={
                                                <IconLib
                                                    icon="refresh"
                                                    size="sm"
                                                />
                                            }
                                            onClick={() => handleAction(actions.sync)}>
                                            Sync now
                                        </Button>
                                        <Button
                                            size="sm"
                                            subtle
                                            disabled={busy || syncing}
                                            onClick={() => handleAction(actions.disconnectSync)}>
                                            Disconnect
                                        </Button>
                                    </View>
                                )}
                            </View>
                            <Divider />
                            <Text colorToken="text-weak">
                                Notes sync automatically while Blot is open. Keep the folder available offline and let
                                your file-sync app finish before switching computers.
                            </Text>
                            <Text colorToken="text-weak">
                                If the same note is edited independently, both versions are kept. Look for a note with
                                “(conflict)” in its title and keep the parts you want.
                            </Text>
                            <Text
                                size="sm"
                                colorToken="text-weaker">
                                This folder keeps readable note history, including deleted notes. Keep it private.
                                Disconnecting keeps your notes and the files already synced.
                            </Text>
                        </View>
                    </TabPanel>
                    <TabPanel>
                        <View className="f-overflow-y-auto f-scrollbar settings-panel">
                            <Heading
                                as="h4"
                                m="1rem 0 1.5rem"
                                fontWeight="var(--f-font-weight-bold)">
                                Import / Export
                            </Heading>
                            <Text colorToken="text-weak">
                                Bring Markdown notes into Blot or save a portable copy of your collection.
                            </Text>
                            <Divider />
                            <View
                                column
                                gap="0.75rem"
                                alignItems="flex-start">
                                <Text fontWeight="var(--f-font-weight-semibold)">Export all notes</Text>
                                <Text colorToken="text-weak">
                                    Save one Markdown file per note in a new folder, with titles, formatting,
                                    checklists, hashtags, images, and attachments. Notes in Trash go in a separate Trash
                                    folder. Protected notes are excluded.
                                </Text>
                                <Button
                                    size="sm"
                                    disabled={busy || syncing}
                                    prefix={
                                        <IconLib
                                            icon="download"
                                            size="sm"
                                        />
                                    }
                                    onClick={() => handleTransfer(false)}>
                                    Export Markdown…
                                </Button>
                            </View>
                            <Divider />
                            <View
                                column
                                gap="0.75rem"
                                alignItems="flex-start">
                                <Text fontWeight="var(--f-font-weight-semibold)">Import Markdown files</Text>
                                <Text colorToken="text-weak">
                                    Select one, several, or all .md files, including Bear exports. Keep exported file
                                    folders beside the files. Each file becomes a new note; existing notes stay as they
                                    are.
                                </Text>
                                <Button
                                    size="sm"
                                    disabled={busy || syncing}
                                    prefix={
                                        <IconLib
                                            icon="upload"
                                            size="sm"
                                        />
                                    }
                                    onClick={() => handleTransfer(true)}>
                                    Choose Markdown files…
                                </Button>
                            </View>
                            {!!transferStatus && (
                                <Text
                                    role="status"
                                    aria-live="polite"
                                    colorToken="text-weak"
                                    style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>
                                    {transferStatus}
                                </Text>
                            )}
                            {!!transferError && (
                                <Text
                                    role="alert"
                                    colorToken="red-500">
                                    {transferError}
                                </Text>
                            )}
                            {!!transferWarning && (
                                <Text
                                    role="status"
                                    aria-live="polite"
                                    size="xs"
                                    colorToken="red-500"
                                    style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>
                                    {transferWarning}
                                </Text>
                            )}
                            <Text
                                size="sm"
                                colorToken="text-weaker">
                                Markdown keeps your content and inline tags. Pin status, dates, and tag appearance are
                                not included. Use File → Back up notes for a full backup.
                            </Text>
                        </View>
                    </TabPanel>
                    <TabPanel>
                        <View className="f-overflow-y-auto f-scrollbar settings-panel">
                            <Heading
                                as="h4"
                                m="1rem 0 1.5rem"
                                fontWeight="var(--f-font-weight-bold)">
                                Privacy
                            </Heading>
                            <Text colorToken="text-weak">
                                Set a PIN, then use the lock in a note’s header to protect it. Unlock once to read all
                                protected notes until Blot closes or your computer sleeps.
                            </Text>
                            <Divider />
                            <View
                                column
                                gap="0.75rem"
                                alignItems="flex-start">
                                <Text fontWeight="var(--f-font-weight-semibold)">
                                    {pinSet ? 'PIN is set' : 'No PIN set'}
                                </Text>
                                <Button
                                    size="sm"
                                    onClick={() => setPinMode(pinSet ? 'clear' : 'add')}>
                                    {pinSet ? 'Clear PIN…' : 'Add PIN…'}
                                </Button>
                            </View>
                            <Text colorToken="text-weak">
                                Protected notes sync encrypted. Use the same PIN on each device and unlock Blot to sync.
                                Protected notes cannot contain images or attachments and are excluded from Markdown
                                export.
                            </Text>
                            <Text
                                size="sm"
                                colorToken="text-weaker">
                                A short PIN provides basic privacy. Existing backups, exports and synced copies remain
                                unchanged. Note titles and tag names remain visible. A forgotten PIN cannot be
                                recovered.
                            </Text>
                        </View>
                    </TabPanel>
                    <TabPanel>
                        <View className="f-overflow-y-auto f-scrollbar settings-panel">
                            <Heading
                                as="h4"
                                m="1rem 0 1.5rem"
                                fontWeight="var(--f-font-weight-bold)">
                                About Blot
                            </Heading>
                            <View
                                column
                                gap="0.75rem"
                                alignItems="flex-start">
                                <Text fontWeight="var(--f-font-weight-semibold)">Version {version}</Text>
                                <Text colorToken="text-weak">Released {released}</Text>
                            </View>
                            <Divider />
                            <Text colorToken="text-weak">
                                For six years Edith had been taking notes on the ducks. This morning one swam over with
                                a clipboard and asked how she spelled her surname.
                            </Text>
                        </View>
                    </TabPanel>
                </TabPanels>
            </Tabs>
            {pinMode && (
                <PinModal
                    mode={pinMode}
                    onSubmit={pinMode === 'add' ? actions.setPin : actions.clearPin}
                    onDismiss={() => setPinMode(null)}
                />
            )}
        </Modal>
    )
}
