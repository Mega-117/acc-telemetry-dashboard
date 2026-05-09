import { clearTelemetryGatewayCache } from '~/composables/useTelemetryGateway'
import { clearSessionPagerCache } from '~/composables/useSessionPager'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { clearCoachDirectoryCache } from '~/repositories/coachDirectoryRepository'
import { clearCoachLessonsCache } from '~/repositories/coachLessonsRepository'
import { clearRaceCalendarCache } from '~/repositories/raceCalendarRepository'
import { clearTelemetryProjectionRepositoryCache } from '~/repositories/telemetryProjectionRepository'

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
    clearTelemetryProjectionRepositoryCache(uid)
    clearTelemetryGatewayCache(uid)
    clearSessionPagerCache(uid)
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
