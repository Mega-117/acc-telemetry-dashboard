import { clearTelemetryGatewayCache } from '~/composables/useTelemetryGateway'
import { clearSessionPagerCache } from '~/composables/useSessionPager'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { clearCoachDirectoryCache } from '~/repositories/coachDirectoryRepository'
import { clearCoachLessonsCache } from '~/repositories/coachLessonsRepository'
import { clearRaceCalendarCache } from '~/repositories/raceCalendarRepository'
import { clearTelemetryProjectionRepositoryCache } from '~/repositories/telemetryProjectionRepository'
import { clearOwnerDocumentCache } from '~/repositories/ownerDocumentRepository'
import { invalidateSyncMirror } from '~/services/sync/syncMirrorService'

export type TelemetryCacheInvalidationScope =
  | 'sync'
  | 'profile'
  | 'manual-refresh'
  | 'calendar'
  | 'coach-lessons'
  | 'coach-directory'
  | 'all'

export interface TelemetryCacheInvalidationOptions {
  uid?: string
  scope?: TelemetryCacheInvalidationScope
  dispatchEvent?: boolean
}

export function invalidateTelemetryCaches(options: TelemetryCacheInvalidationOptions = {}) {
  const { uid, scope = 'all', dispatchEvent = true } = options

  if (scope === 'all' || scope === 'sync' || scope === 'profile' || scope === 'manual-refresh') {
    // PIP-442: il documento owner condiviso e' stato riscritto (sync/profilo) o l'utente
    // vuole dati freschi: la prossima lettura porta la revisione nuova.
    clearOwnerDocumentCache(uid)
    clearTelemetryProjectionRepositoryCache(uid)
    clearTelemetryGatewayCache(uid)
    clearSessionPagerCache(uid)
  }

  // PIP-444: il mirror della sync sopravvive allo scope `sync` (lo pubblica la sync stessa
  // dopo il commit); logout, cambio account e refresh manuale lo svuotano. Chi riscrive i
  // riepiloghi fuori dal piano (manutenzione, rebuild) chiama `invalidateSyncMirror`.
  if (scope === 'all' || scope === 'manual-refresh') {
    invalidateSyncMirror(uid)
  }

  if (scope === 'all' || scope === 'calendar' || scope === 'manual-refresh') {
    clearRaceCalendarCache(uid)
  }

  if (scope === 'all' || scope === 'coach-lessons' || scope === 'manual-refresh') {
    clearCoachLessonsCache(uid)
  }

  if (scope === 'all' || scope === 'coach-directory' || scope === 'profile' || scope === 'manual-refresh') {
    clearCoachDirectoryCache()
  }

  if (scope === 'all' || scope === 'manual-refresh') {
    try {
      useFirebaseAuth().clearCachedUserProfile(uid)
    } catch {
      // The auth composable may be unavailable in isolated tests.
    }
  }

  if (dispatchEvent && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('acc:telemetry-cache-invalidated', {
      detail: { uid: uid || null, scope }
    }))
  }
}
