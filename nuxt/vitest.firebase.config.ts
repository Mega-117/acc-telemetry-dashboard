import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '~': resolve(root, 'app'),
      '@': resolve(root, 'app')
    }
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/firebase/**/*.test.ts']
  }
})
