import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
    base: './',
    build: { outDir: '../docs', emptyOutDir: true },
    plugins: [react()],
    server: {
        host: '127.0.0.1',
        port: 4320,
        strictPort: true,
        fs: { allow: [__dirname, path.resolve(__dirname, '../app/src')] },
    },
    resolve: {
        dedupe: ['react', 'react-dom'],
    },
})
