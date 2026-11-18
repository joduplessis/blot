import { Button, Heading, Modal, PinInput, Portal, Text, View } from '@fold-ui/core'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorText } from '@/hooks/api.hooks'

export const PinModal = ({
    mode,
    onSubmit,
    onDismiss,
}: {
    mode: 'add' | 'clear' | 'unlock'
    onSubmit(pin: string): Promise<void>
    onDismiss(): void
}) => {
    const [pin, setPin] = useState('')
    const [firstPin, setFirstPin] = useState('')
    const [revision, setRevision] = useState(0)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const form = useRef<HTMLFormElement>(null)
    const title =
        mode === 'unlock' ? 'Unlock Blot' : mode === 'clear' ? 'Clear PIN' : firstPin ? 'Confirm PIN' : 'Add a PIN'

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (busy) return
        if (!/^\d{6}$/.test(pin)) return setError('Enter all six digits.')
        if (mode === 'add' && !firstPin) {
            setFirstPin(pin)
            setPin('')
            setRevision(revision + 1)
            setError('')
            return
        }
        if (mode === 'add' && pin !== firstPin) return setError('The PINs do not match. Try again.')

        setBusy(true)
        setError('')

        try {
            await onSubmit(pin)
            onDismiss()
        } catch (error) {
            setError(errorText(error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''))
            setPin('')
            setRevision(revision + 1)
        } finally {
            setBusy(false)
        }
    }

    useEffect(() => {
        const inputs = form.current?.querySelectorAll('input')
        inputs?.forEach((input, index) => {
            input.inputMode = 'numeric'
            input.autocomplete = 'off'
            input.setAttribute('aria-label', `PIN digit ${index + 1}`)
        })
        inputs?.[0]?.focus()
    }, [revision])

    return (
        <Modal
            header={<Heading as="h4">{title}</Heading>}
            aria-label={title}
            role="dialog"
            width={300}
            style={{ maxWidth: '95%' }}
            anchor="middle-center"
            portal={Portal}
            disableBackgroundDismiss
            onDismiss={() => !busy && onDismiss()}
            isVisible>
            <form
                ref={form}
                onSubmit={submit}>
                <View
                    column
                    alignItems="stretch"
                    gap={20}>
                    <Text colorToken="text-weak">
                        {mode === 'clear'
                            ? 'Enter your current PIN. This removes encryption from all protected notes on this device.'
                            : mode === 'unlock'
                            ? 'Enter your PIN to read protected notes until Blot closes or your computer sleeps.'
                            : firstPin
                            ? 'Enter the same PIN again.'
                            : 'Choose a six-digit PIN. Keep it safe: forgotten PINs cannot be recovered.'}
                    </Text>
                    <PinInput
                        key={revision}
                        digits={6}
                        type="password"
                        size="lg"
                        defaultValue={pin}
                        disabled={busy}
                        onChange={(values: any) => setPin(values.join(''))}
                        onPasteCapture={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            if (busy) return

                            setPin(event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6))
                            setRevision(revision + 1)
                        }}
                    />
                    {error && (
                        <Text
                            role="alert"
                            colorToken="red-500">
                            {error}
                        </Text>
                    )}
                    <View
                        row
                        gap={12}
                        justifyContent="flex-end">
                        <Button
                            type="button"
                            subtle
                            disabled={busy}
                            onClick={onDismiss}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={busy}>
                            {busy
                                ? 'Please wait…'
                                : mode === 'clear'
                                ? 'Clear PIN and decrypt notes'
                                : mode === 'unlock'
                                ? 'Unlock'
                                : firstPin
                                ? 'Save PIN'
                                : 'Continue'}
                        </Button>
                    </View>
                </View>
            </form>
        </Modal>
    )
}
