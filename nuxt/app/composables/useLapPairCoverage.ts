import { computed, watch, type Ref } from 'vue'
import { lapPairCheck, traceCoversLap } from '~/services/telemetry/traceCoverage'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'
import { noteFeatureUse } from '~/services/usage/featureUseNote'
import { useI18n } from '~/i18n'

/**
 * PIP-751: the Telemetria header uses ACC's lap times, the delta, the segments and the measured sectors the
 * traces' own clock. A trace that does not cover its lap (Silverstone laps saved before the fix: 1.7 s short)
 * would make the page say the opposite of itself: those are drawn only from a pair that agrees with ACC
 * (`deltaReference`, null otherwise), never stretched. The page says why (`note`). The corners and the session
 * zones come only from laps that cover their time (`covers`, Codex 08/11: a short trace shifts them along the lap).
 * The sector box shows YOUR time, said so: it showed the reference's without a word, and a driver read 35.597 /
 * 49.542 / 32.847 as his sectors instead of ACC's 35.200 / 49.930 / 33.757.
 */
export function useLapPairCoverage(o: { lap: Ref<LapTraceView | null>, reference: Ref<LapTraceView | null>, lapId: Ref<string>, refId: Ref<string>,
  traces: Ref<Record<string, LapTraceView>> }) {
  const { t } = useI18n()
  const pair = computed(() => o.lap.value && o.reference.value ? lapPairCheck(o.lap.value, o.reference.value) : null)
  const deltaReference = computed(() => pair.value?.comparable ? o.reference.value : null)
  const note = computed(() => {
    const p = pair.value
    if (!p || p.comparable) return ''
    const side = !p.you.covers && !p.ref.covers ? 'both' : !p.you.covers ? 'you' : !p.ref.covers ? 'ref' : 'pair'
    const gapMs = side === 'ref' ? p.ref.spanGapMs : side === 'you' ? p.you.spanGapMs
      : side === 'both' ? Math.max(Math.abs(p.you.spanGapMs ?? 0), Math.abs(p.ref.spanGapMs ?? 0)) : p.mismatchMs
    return t(`telemetry.coverage.${side}`, { gap: gapMs === null ? '?' : (Math.abs(gapMs) / 1000).toFixed(2) })
  })
  // Spy (PIP-720), once per shown pair: comparable, the worse trace's distance from ACC, delta end vs header.
  watch(() => pair.value ? JSON.stringify([o.lapId.value, o.refId.value, pair.value.comparable, pair.value.spanGapMs, pair.value.mismatchMs]) : '', key => {
    const p = pair.value
    if (key && p) noteFeatureUse({ event: 'laps.gap_check', comparable: p.comparable ? 1 : 0, spanGapMs: p.spanGapMs ?? 0, mismatch: p.mismatchMs ?? 0 })
  }, { immediate: true })
  /** The sector box shows your time; the tooltip names both (only yours without a comparable reference). */
  function sectorTip(g: { mine: number | null, ref: number | null }) {
    const you = g.mine !== null ? (g.mine / 1000).toFixed(3) : '--'
    return g.ref !== null ? t('telemetry.sectorTitle', { you, ref: (g.ref / 1000).toFixed(3) }) : t('telemetry.sectorTitleYou', { you })
  }
  const covers = (id: string) => !!o.traces.value[id] && traceCoversLap(o.traces.value[id]!).covers
  return { pair, deltaReference, note, sectorTip, covers }
}
