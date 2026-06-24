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
        'app/services/projections/trackBestProjectionGuard.ts',
        'app/services/session-detail/sessionMath.ts',
        'app/services/session-detail/sessionLapSeries.ts',
        'app/services/sync/ownerDataRepairService.ts',
        'app/services/sync/sessionUploadService.ts',
        'app/services/sync/syncTriggerPolicy.ts',
        'app/services/telemetry/raceFuelClassification.ts',
        'app/services/telemetry/sessionMergeLogic.ts',
        'app/services/telemetry/theoreticalTimesCalculator.ts',
        'app/services/spotter/trackVoiceReferences.ts',
        'app/utils/firestoreSanitize.ts',
        'app/utils/featureAccess.ts',
        'app/utils/sessionParser.ts',
        'server/utils/kokoroRuntimeStatus.ts',
        'server/utils/trackVoicePointMerge.ts',
        'server/utils/voiceScriptNormalize.ts',
        // ── Phase 3: composables ─────────────────────────────────────────
        'app/composables/useLiveStatePoller.ts',
        'app/composables/useFastStatePoller.ts',
        'app/composables/useSessionOrchestrator.ts',
        'app/composables/useCoachInsights.ts',
        // ── Phase 4: composables estratti da useTelemetryData ────────────
        'app/composables/useSessionLoader.ts',
        'app/composables/useSessionSharing.ts',
        'app/composables/useTrackBests.ts',
        // ── PIP-175: overlay HUD multipli ────────────────────────────────
        'app/composables/useHudOverlay.ts',
      ],
    },
  },
})
