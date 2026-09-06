import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  resolve: { alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/firebase/pitwallRealtime.emulator.test.ts'],
    testTimeout: 15000, hookTimeout: 20000, fileParallelism: false },
})
