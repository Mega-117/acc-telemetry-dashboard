import type { SpotterPhraseKey } from '~/config/spotterPhrases'
import { resolveDemoKeySector, type SpotterSector } from './spotterFormatters'
import { renderSpotterPhrase } from './spotterPhraseRenderer'

export interface SpotterLiveSnapshot {
  ts?: string
  laps_completed?: number | null
  gap_ahead_ms?: number | null
  gap_behind_ms?: number | null
  completed_sectors?: number[] | null
}

export type SpotterTarget = 'ahead' | 'behind'
export type SpotterTrend = 'gaining' | 'losing' | 'stable'
export type SpotterUrgency = 'info' | 'attack' | 'defend'

export interface SpotterEvent {
  id: string
  target: SpotterTarget
  trigger: 'player_lap_completed' | 'periodic_probe'
  trend: SpotterTrend
  deltaMs: number
  sector: SpotterSector | null
  urgency: SpotterUrgency
  messageKey: SpotterPhraseKey
  messageText: string
}

export interface SpotterAnalyzerOptions {
  stableThresholdMs?: number
  attackGapMs?: number
  cooldownMs?: number
  sameMessageCooldownMs?: number
}

interface AnalyzerState {
  previous: SpotterLiveSnapshot | null
  lastEventAt: number
  lastByKeyAt: Map<string, number>
}

const DEFAULTS = {
  stableThresholdMs: 150,
  attackGapMs: 1000,
  cooldownMs: 8000,
  sameMessageCooldownMs: 20000,
}

export function createSpotterAnalyzer(options: SpotterAnalyzerOptions = {}) {
  const config = { ...DEFAULTS, ...options }
  const state: AnalyzerState = {
    previous: null,
    lastEventAt: -Infinity,
    lastByKeyAt: new Map(),
  }

  function canEmit(event: SpotterEvent, now: number) {
    if (now - state.lastEventAt < config.cooldownMs) return false
    const key = `${event.target}:${event.messageKey}`
    const lastSame = state.lastByKeyAt.get(key) ?? -Infinity
    return now - lastSame >= config.sameMessageCooldownMs
  }

  function markEmitted(event: SpotterEvent, now: number) {
    state.lastEventAt = now
    state.lastByKeyAt.set(`${event.target}:${event.messageKey}`, now)
  }

  function analyze(snapshot: SpotterLiveSnapshot | null | undefined, now = Date.now()): SpotterEvent[] {
    if (!snapshot) return []
    const previous = state.previous
    state.previous = snapshot

    if (!previous) return []
    const prevLaps = normalizeNumber(previous.laps_completed)
    const nextLaps = normalizeNumber(snapshot.laps_completed)
    const playerCompletedLap = prevLaps !== null && nextLaps !== null && nextLaps > prevLaps
    if (!playerCompletedLap) return []

    const candidates = [
      buildGapEvent('ahead', previous.gap_ahead_ms, snapshot.gap_ahead_ms, snapshot, now, config),
      buildGapEvent('behind', previous.gap_behind_ms, snapshot.gap_behind_ms, snapshot, now, config),
    ].filter(Boolean) as SpotterEvent[]

    const emitted: SpotterEvent[] = []
    for (const event of candidates) {
      if (!canEmit(event, now)) continue
      markEmitted(event, now)
      emitted.push(event)
    }
    return emitted
  }

  function reset() {
    state.previous = null
    state.lastEventAt = -Infinity
    state.lastByKeyAt.clear()
  }

  return { analyze, reset }
}

function buildGapEvent(
  target: SpotterTarget,
  previousGap: number | null | undefined,
  nextGap: number | null | undefined,
  snapshot: SpotterLiveSnapshot,
  now: number,
  config: typeof DEFAULTS
): SpotterEvent | null {
  const prev = normalizeNumber(previousGap)
  const next = normalizeNumber(nextGap)
  if (prev === null || next === null) return null

  const gapChange = next - prev
  const deltaMs = Math.abs(gapChange)
  const stable = deltaMs < config.stableThresholdMs
  const trend = stable ? 'stable' : resolveTrend(target, gapChange)
  const sector = resolveDemoKeySector(
    snapshot.completed_sectors,
    trend === 'losing' || (target === 'behind' && trend === 'gaining') ? 'weakest' : 'strongest'
  )
  const messageKey = resolveMessageKey(target, trend, next, config.attackGapMs)
  const urgency = resolveUrgency(target, trend, next, config.attackGapMs)

  return {
    id: `${target}-${now}-${messageKey}`,
    target,
    trigger: 'player_lap_completed',
    trend,
    deltaMs,
    sector,
    urgency,
    messageKey,
    messageText: renderSpotterPhrase({ key: messageKey, deltaMs, sector }),
  }
}

function resolveTrend(target: SpotterTarget, gapChange: number): SpotterTrend {
  if (target === 'ahead') return gapChange < 0 ? 'gaining' : 'losing'
  return gapChange < 0 ? 'gaining' : 'losing'
}

function resolveMessageKey(
  target: SpotterTarget,
  trend: SpotterTrend,
  currentGapMs: number,
  attackGapMs: number
): SpotterPhraseKey {
  if (target === 'ahead' && trend === 'gaining' && currentGapMs <= attackGapMs) return 'attackWindow'
  if (target === 'ahead' && trend === 'gaining') return 'aheadGaining'
  if (target === 'ahead' && trend === 'losing') return 'aheadLosing'
  if (target === 'ahead') return 'aheadStable'
  if (target === 'behind' && trend === 'gaining') return 'behindClosing'
  if (target === 'behind' && trend === 'losing') return 'behindDropping'
  return 'behindStable'
}

function resolveUrgency(
  target: SpotterTarget,
  trend: SpotterTrend,
  currentGapMs: number,
  attackGapMs: number
): SpotterUrgency {
  if (target === 'ahead' && trend === 'gaining' && currentGapMs <= attackGapMs) return 'attack'
  if (target === 'behind' && trend === 'gaining' && currentGapMs <= attackGapMs) return 'defend'
  return 'info'
}

function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}
