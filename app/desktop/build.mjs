import { build } from '../node_modules/esbuild/lib/main.js'

await build({
    entryPoints: ['src/notes.service.ts', 'src/folder-sync.service.ts', 'src/markdown.service.ts'],
    outdir: 'dist',
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
})
