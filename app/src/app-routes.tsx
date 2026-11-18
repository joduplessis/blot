import { AppProvider } from '@fold-ui/core'
import './services/icons'
import { AppLayout } from './layouts/app.layout'

export default function AppRoutes() {
    return (
        <AppProvider>
            <AppLayout />
        </AppProvider>
    )
}
