import { App, AppContext, Button, Content, IconLib, Main, Text, View } from '@fold-ui/core'
import { useContext, useEffect } from 'react'
import { notesAPI } from '@/hooks/api.hooks'
import { Nav } from '@/components/nav/nav'
import { useAppStore } from '@/store/app'
import { PinModal } from '@/modals/pin.modal'
import { Calendar } from '@/components/calendar/calendar'
import { NotesLayout } from './notes.layout'

export const AppLayout = () => {
    const { theme } = useContext(AppContext).app

    const unlockOpen = useAppStore((state) => state.unlockOpen)
    const error = useAppStore((state) => state.error)
    const status = useAppStore((state) => state.status)
    const calendar = useAppStore((state) => state.filter === 'upcoming')
    const focusMode = useAppStore((state) => state.focusMode)
    const actions = useAppStore((state) => state.actions)

    useEffect(() => {
        if (theme === 'light' || theme === 'dark') window.blot?.setWindowTheme?.(theme).catch(actions.setError)
    }, [theme, actions])

    useEffect(() => {
        actions.refresh()
        const unsubscribe = window.blot?.onBeforeClose(async () => {
            await actions.flush()
            await actions.sync()
            await actions.flush()
        })
        const unsubscribeLock = window.blot?.onLockRequest?.(() => {
            actions.lock().catch(actions.setError)
        })
        const unsubscribeSync = window.blot?.onSyncRequest?.(actions.sync)
        const unsubscribeBackup = window.blot?.onBackup(() => {
            actions
                .flush()
                .then(() => notesAPI().backup())
                .catch(actions.setError)
        })
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (useAppStore.getState().status !== 'saved') {
                event.preventDefault()
                event.returnValue = ''
                actions.flush().catch(() => {})
            }
        }
        window.addEventListener('beforeunload', beforeUnload)
        return () => {
            unsubscribe?.()
            unsubscribeSync?.()
            unsubscribeLock?.()
            unsubscribeBackup?.()
            window.removeEventListener('beforeunload', beforeUnload)
        }
    }, [])

    useEffect(() => {
        const keydown = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey)) return
            if (event.key.toLowerCase() === 'n') {
                event.preventDefault()
                actions.createNote()
            }
            if (event.key.toLowerCase() === 's') {
                event.preventDefault()
                actions.flush().catch(() => {})
            }
            if (event.key.toLowerCase() === 'f') {
                event.preventDefault()
                if (event.shiftKey) actions.toggleFocus()
                else {
                    if (useAppStore.getState().focusMode) actions.toggleFocus()
                    requestAnimationFrame(() =>
                        document.querySelector<HTMLInputElement>('[aria-label="Search notes and text"]')?.focus()
                    )
                }
            }
        }
        window.addEventListener('keydown', keydown)
        return () => window.removeEventListener('keydown', keydown)
    }, [])

    return (
        <App bg="transparent">
            <Content
                className="app-content"
                height="100%">
                {!focusMode && <Nav />}
                <Main
                    column
                    p="var(--frame-padding) var(--frame-padding) var(--frame-padding) 0"
                    alignItems="stretch"
                    justifyContent="flex-start">
                    {error && (
                        <View
                            row
                            p="10px 20px"
                            gap={12}
                            bgToken="surface-strong"
                            role="alert"
                            shrink={0}>
                            <IconLib
                                icon="warning"
                                size="sm"
                            />
                            <Text
                                size="sm"
                                flex={1}>
                                {error}
                            </Text>
                            {status === 'error' && (
                                <Button
                                    size="xs"
                                    onClick={() =>
                                        actions
                                            .flush()
                                            .then(() => actions.setError(''))
                                            .catch(() => {})
                                    }>
                                    Retry saving
                                </Button>
                            )}
                            <Button
                                subtle
                                square
                                size="xs"
                                aria-label="Dismiss error"
                                onClick={() => actions.setError('')}>
                                <IconLib
                                    icon="x"
                                    size="sm"
                                />
                            </Button>
                        </View>
                    )}
                    {calendar ? <Calendar /> : <NotesLayout />}
                </Main>
            </Content>
            {unlockOpen && (
                <PinModal
                    mode="unlock"
                    onSubmit={actions.unlock}
                    onDismiss={actions.dismissUnlock}
                />
            )}
        </App>
    )
}
