import React, { Component } from 'react'
import ReactDOM from 'react-dom/client'
import AppRoutes from './app-routes'
import { StartupError } from './components/startup-error'
import './styles.css'

class AppBoundary extends Component<{ children: React.ReactNode }, { error: boolean }> {
    state = { error: false }

    static getDerivedStateFromError() {
        return { error: true }
    }

    render() {
        if (this.state.error) return <StartupError />

        return this.props.children
    }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <AppBoundary>
        <AppRoutes />
    </AppBoundary>
)
