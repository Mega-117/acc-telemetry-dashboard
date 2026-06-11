import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tsconfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    vue(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: {
      '~': resolve(root, 'app'),
      '@': resolve(root, 'app'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Lista esplicita: solo i file che hanno test associati.
      // Aggiungere qui ogni nuovo file quando si scrivono i suoi test.
      // Questo rende le thresholds un contratto verificabile, non un numero illusorio.
      include: [
        // ── Phase 1–2: services e utils ──────────────────────────────────
        'app/services/gateway/activityProjectionBuilders.ts',
        'app/services/gateway/bestTimesBuilders.ts',
        'app/services/gateway/trackDetailProjectionBuilder.ts',
        'app/services/session-detail/sessionMath.ts',
        'app/services/sync/syncTriggerPolicy.ts',
        'app/services/telemetry/sessionMergeLogic.ts',
        'app/services/telemetry/theoreticalTimesCalculator.ts',
        'app/utils/firestoreSanitize.ts',
        'app/utils/sessionParser.ts',
        // ── Phase 3: composables ─────────────────────────────────────────
        'app/composables/useLiveStatePoller.ts',
        'app/composables/useSessionOrchestrator.ts',
        // ── Phase 4: composables estratti da useTelemetryData ────────────
        'app/composables/useSessionLoader.ts',
        'app/composables/useSessionSharing.ts',
        'app/composables/useTrackBests.ts',
      ],
    },
  },
})
