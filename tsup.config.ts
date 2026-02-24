import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  minify: true,
  dts: true,
  treeshake: true,
  splitting: false,
  clean: true,
  outDir: 'dist',
  target: 'es2022',
})
