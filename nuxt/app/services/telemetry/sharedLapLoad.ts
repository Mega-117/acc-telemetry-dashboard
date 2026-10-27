// PIP-623/652: a lap received by link becomes a reference. One place for the rules, used by the lap panel
// and by the page's "Confronta" window: whole valid laps only, same track and layout (another car is
// compared with a note), the driver's nickname in the label.
import { parseLapShareLink } from './lapShareLink'
import { fetchSharedLap, LapsArchiveError, type LapsArchiveDeps } from './lapsArchiveClient'
import { normalizeLapTrace, type LapTraceView } from './lapTraceChart'
import { loadPublicNickname } from '~/repositories/publicProfileRepository'
import { formatLapTime } from '~/utils/telemetryFormat'
import { noteFeatureUse } from '~/services/usage/featureUseNote'
import { useI18n } from '~/i18n'

export interface SharedLapLoaded { id: string, trace: LapTraceView, label: string, lapNumber: number, lapTimeMs: number, carMismatch: boolean }

export function sameLapContext(trace: LapTraceView, current: LapTraceView | null) {
  return !current || (trace.gameId === current.gameId && trace.track === current.track && (trace.variant ?? null) === (current.variant ?? null))
}

/** `{ lap }` or `{ error }` (a sentence for the user). `isCurrent` false = the page moved on: nothing is returned. */
export async function loadSharedLapLink(text: string, current: LapTraceView | null, deps: LapsArchiveDeps,
  o: { nickname?: (uid: string) => Promise<string | null>, isCurrent?: () => boolean } = {}): Promise<{ lap?: SharedLapLoaded, error?: string } | null> {
  const link = parseLapShareLink(text)
  const { t } = useI18n()
  if (!link) return { error: t('telemetry.sharedLap.linkUnknown') }
  const isCurrent = o.isCurrent ?? (() => true)
  try {
    const { trace: raw, meta } = await fetchSharedLap(link, deps)
    if (!isCurrent()) return null
    const trace = normalizeLapTrace(raw)
    if (!trace) return { error: t('telemetry.sharedLap.badFormat') }
    // Only whole, valid laps are references: a partial lap would compare different places.
    if (!trace.complete || trace.valid !== true) return { error: t('telemetry.sharedLap.notValid') }
    if (!sameLapContext(trace, current)) return { error: t('telemetry.sharedLap.otherTrack', { track: trace.track }) }
    const nickname = (await (o.nickname ?? loadPublicNickname)(meta.ownerUid)) || t('sessions.picker.driver')
    if (!isCurrent() || !sameLapContext(trace, current)) return null
    const lapNumber = meta.lapNumber ?? 0
    const lapTimeMs = meta.lapTimeMs ?? Math.round(trace.lapTimeS * 1000)
    noteFeatureUse({ event: 'laps.share_pasted', laps: 1 })
    return { lap: { id: `shared:${link.shareId}`, trace, lapNumber, lapTimeMs, label: `${nickname} · ${t('sessionDetail.chart.lap', { lap: lapNumber })} · ${formatLapTime(lapTimeMs)}`, carMismatch: !!current && trace.car !== current.car } }
  } catch (e) {
    return isCurrent() ? { error: e instanceof LapsArchiveError ? e.message : t('telemetry.sharedLap.loadError') } : null
  }
}
