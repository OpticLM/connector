import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/lsp/index.ts',
    'src/mcp/index.ts',
    'src/pipe/index.ts',
    'src/ai-sdk/index.ts',
    'src/schemas.ts',
  ],
  format: ['esm'],
  minify: true,
  dts: true,
  treeshake: true,
  splitting: false,
  clean: true,
  outDir: 'dist',
  target: 'es2022',
})
