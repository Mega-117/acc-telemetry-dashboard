import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  resolve: { alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/firebase/pitwallRealtime.load.test.ts'], testTimeout: 240000, hookTimeout: 60000, fileParallelism: false },
})
