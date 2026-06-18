import { TRACK_BESTS_SCHEMA_VERSION } from '~/services/sync/trackBestsProjectionService'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'

// A trackBests document older than the VNext schema can contain legacy race/AVG
// values without fuel buckets. Treat it as unavailable instead of showing stale
// references as if they were canonical.
export function isSupportedTrackBestProjection(trackBestDoc: any | null | undefined): boolean {
  if (!trackBestDoc?.bests) return false
  const schemaVersion = Number(trackBestDoc.version || 0)
  const rulesVersion = Number(trackBestDoc.bestRulesVersion || 0)
  return schemaVersion >= TRACK_BESTS_SCHEMA_VERSION && rulesVersion >= BEST_RULES_VERSION
}
