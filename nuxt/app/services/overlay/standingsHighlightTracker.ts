import type {
  StandingsCarSnapshot,
  StandingsHighlightMap,
  StandingsPersonalBestFlash,
  StandingsPositionFlash,
  StandingsSnapshot,
} from './standingsPresentation'

export const POSITION_IMPROVED_FLASH_MS = 5000
export const POSITION_WORSENED_FLASH_MS = 4000
export const REMOVED_CAR_SUPPRESSION_MS = 2000
export const PERSONAL_BEST_FLASH_MS = 10_000

interface TimedPositionFlash {
  value: StandingsPositionFlash
  expiresAtMs: number
}

interface TimedPersonalBestFlash {
  value: StandingsPersonalBestFlash
  expiresAtMs: number
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function positiveLapTime(value: unknown): number | null {
  const numeric = finiteNumber(value)
  return numeric !== null && numeric > 0 ? Math.round(numeric) : null
}

function positionOf(car: StandingsCarSnapshot): number | null {
  const position = finiteNumber(car.cup_position)
  return position !== null && Number.isInteger(position) && position > 0 ? position : null
}

function completedLaps(car: StandingsCarSnapshot): number | null {
  const laps = finiteNumber(car.laps)
  return laps !== null && Number.isInteger(laps) ? laps : null
}

function lastLapToken(car: StandingsCarSnapshot): string | null {
  const laps = completedLaps(car)
  const timeMs = positiveLapTime(car.last_lap?.time_ms)
  return laps !== null && timeMs !== null ? `${laps}:${timeMs}` : null
}

function isValidPersonalBest(car: StandingsCarSnapshot): boolean {
  const lastLapMs = positiveLapTime(car.last_lap?.time_ms)
  const bestLapMs = positiveLapTime(car.best_lap?.time_ms) ?? positiveLapTime(car.best_lap_ms)
  return (
    lastLapMs !== null
    && bestLapMs !== null
    && lastLapMs === bestLapMs
    && car.last_lap?.is_invalid === false
    && car.last_lap?.is_valid_for_best === true
  )
}

function sessionKey(snapshot: StandingsSnapshot): string {
  return `${String(snapshot.session.event_index)}:${String(snapshot.session.session_index)}`
}

/**
 * Stateful, deterministic V2 highlight rules. No timers or I/O live here:
 * callers provide the clock and request the active highlights for that instant.
 */
export function createStandingsHighlightTracker() {
  let initialized = false
  let activeSessionKey: string | null = null
  let knownCarIndexes = new Set<number>()
  let comparablePositions = new Map<number, number>()
  let lastLapTokens = new Map<number, string | null>()
  let positionSuppressedUntilMs = 0
  const positionFlashes = new Map<number, TimedPositionFlash>()
  const personalBestFlashes = new Map<number, TimedPersonalBestFlash>()

  function reset(): void {
    initialized = false
    activeSessionKey = null
    knownCarIndexes = new Set()
    comparablePositions = new Map()
    lastLapTokens = new Map()
    positionSuppressedUntilMs = 0
    positionFlashes.clear()
    personalBestFlashes.clear()
  }

  function getHighlights(nowMs: number): StandingsHighlightMap {
    const result: Record<number, {
      positionFlash: StandingsPositionFlash | null
      lastLapPersonalBest: StandingsPersonalBestFlash | null
    }> = {}
    const indexes = new Set<number>([...positionFlashes.keys(), ...personalBestFlashes.keys()])

    indexes.forEach((carIndex) => {
      const positionEvent = positionFlashes.get(carIndex)
      const personalBestEvent = personalBestFlashes.get(carIndex)
      if (positionEvent && positionEvent.expiresAtMs <= nowMs) positionFlashes.delete(carIndex)
      if (personalBestEvent && personalBestEvent.expiresAtMs <= nowMs) personalBestFlashes.delete(carIndex)
      const positionFlash = positionFlashes.get(carIndex)?.value ?? null
      const lastLapPersonalBest = personalBestFlashes.get(carIndex)?.value ?? null
      if (positionFlash || lastLapPersonalBest) {
        result[carIndex] = { positionFlash, lastLapPersonalBest }
      }
    })

    return result
  }

  function update(snapshot: StandingsSnapshot, nowInput = Date.now()): StandingsHighlightMap {
    const nowMs = finiteNumber(nowInput)
    if (nowMs === null) return {}

    const nextSessionKey = sessionKey(snapshot)
    if (activeSessionKey !== nextSessionKey) {
      reset()
      activeSessionKey = nextSessionKey
    }

    const currentIndexes = new Set(snapshot.cars.map(car => car.car_index))
    const carWasRemoved = initialized && [...knownCarIndexes].some(carIndex => !currentIndexes.has(carIndex))
    if (carWasRemoved) {
      positionSuppressedUntilMs = nowMs + REMOVED_CAR_SUPPRESSION_MS
      positionFlashes.clear()
    }

    const phase = finiteNumber(snapshot.session.phase)
    const phaseBlocksPositions = phase === 2 || phase === 3
    if (phaseBlocksPositions) positionFlashes.clear()

    const nextComparablePositions = new Map<number, number>()
    const nextLastLapTokens = new Map<number, string | null>()

    snapshot.cars.forEach((car) => {
      const position = positionOf(car)
      const laps = completedLaps(car)
      const canTrackPosition = !phaseBlocksPositions && laps !== null && laps >= 0 && position !== null
      const previousPosition = comparablePositions.get(car.car_index)

      if (
        initialized
        && canTrackPosition
        && previousPosition !== undefined
        && nowMs >= positionSuppressedUntilMs
        && position !== previousPosition
      ) {
        const improved = position < previousPosition
        positionFlashes.set(car.car_index, {
          value: improved ? 'improved' : 'worsened',
          expiresAtMs: nowMs + (improved ? POSITION_IMPROVED_FLASH_MS : POSITION_WORSENED_FLASH_MS),
        })
      }
      if (canTrackPosition) nextComparablePositions.set(car.car_index, position)
      else positionFlashes.delete(car.car_index)

      const token = lastLapToken(car)
      const previousToken = lastLapTokens.get(car.car_index)
      if (
        initialized
        && laps !== null
        && laps >= 0
        && token !== null
        && previousToken !== undefined
        && token !== previousToken
        && isValidPersonalBest(car)
      ) {
        personalBestFlashes.set(car.car_index, {
          value: car.car_index === snapshot.session.focused_car_index ? 'focused' : 'other',
          expiresAtMs: nowMs + PERSONAL_BEST_FLASH_MS,
        })
      }
      nextLastLapTokens.set(car.car_index, token)
    })

    for (const carIndex of personalBestFlashes.keys()) {
      if (!currentIndexes.has(carIndex)) personalBestFlashes.delete(carIndex)
    }

    knownCarIndexes = currentIndexes
    comparablePositions = nextComparablePositions
    lastLapTokens = nextLastLapTokens
    initialized = true
    return getHighlights(nowMs)
  }

  return { update, getHighlights, reset }
}
