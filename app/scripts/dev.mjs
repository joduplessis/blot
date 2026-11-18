import { spawn } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit' })
let desktop
let stopping = false
let ready = false

const stop = (code = 0) => {
    if (stopping) return
    stopping = true
    vite.kill()
    desktop?.kill()
    process.exitCode = code
}

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
vite.on('exit', (code) => stop(code || 0))
vite.on('error', (error) => {
    console.error(error.message)
    stop(1)
})

for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
    try {
        const response = await fetch('http://127.0.0.1:4318')
        if (response.ok) {
            ready = true
            break
        }
    } catch {}

    await setTimeout(250)
}

if (!ready || stopping) {
    if (!stopping) console.error('Blot could not start its local development server.')
    stop(1)
} else {
    desktop = spawn(process.execPath, ['desktop/node_modules/electron/cli.js', 'desktop'], {
        stdio: 'inherit',
        env: { ...process.env, BLOT_DEV: '1' },
    })
    desktop.on('exit', (code) => stop(code || 0))
    desktop.on('error', (error) => {
        console.error(error.message)
        stop(1)
    })
}
