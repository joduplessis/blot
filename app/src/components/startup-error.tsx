import { Button, Heading, IconLib, Text } from '@fold-ui/core'
import { BlotOctopus } from './common/blot-octopus'

export const StartupError = () => (
    <main className="startup-error">
        <BlotOctopus />
        <div
            className="startup-error-copy"
            role="alert">
            <Heading as="h2">Let’s try that again.</Heading>
            <Text colorToken="text-weaker">
                Blot couldn’t display this screen. Your saved data is still on this device.
            </Text>
        </div>
        <Button
            prefix={
                <IconLib
                    icon="refresh"
                    size="sm"
                />
            }
            onClick={() => window.location.reload()}>
            Refresh Blot
        </Button>
    </main>
)
