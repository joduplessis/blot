import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
    base: './',
    plugins: [react()],
    server: { host: '127.0.0.1', port: 4318, strictPort: true },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
        dedupe: ['react', 'react-dom'],
    },
})
