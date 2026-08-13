import type { FullSession, LapData, StintData } from '~/types/telemetry'

function isValidComparisonLap(lap: LapData): boolean {
  return lap.is_valid && !lap.has_pit_stop
}

export function autoSelectComparisonStints(params: {
  primarySession: { stints: Array<{ number: number }> }
  secondarySession: FullSession
  bestRaceStint: { number: number } | null
  bestQualyStint: { number: number } | null
}) {
  const { primarySession, secondarySession, bestRaceStint, bestQualyStint } = params
  const primaryBest = bestRaceStint || bestQualyStint
  const primaryStint = primaryBest?.number || primarySession.stints[0]?.number || null
  if (!primaryStint) {
    return { primaryStint: null, secondaryStint: null }
  }

  const stints = secondarySession.stints || []
  let bestSecondaryStint: number | null = null
  let bestSecondaryLapMs: number | null = null

  stints.forEach((stint: StintData) => {
    const validLaps = (stint.laps || []).filter(isValidComparisonLap)
    if (validLaps.length === 0) return
    const bestMs = Math.min(...validLaps.map((lap: LapData) => lap.lap_time_ms))
    const isRace = stint.type !== 'Qualify'
    const currentIsRace = bestSecondaryStint !== null && stints.find((item: StintData) => item.stint_number === bestSecondaryStint)?.type !== 'Qualify'

    if (bestSecondaryLapMs === null || (isRace && !currentIsRace) || (isRace === currentIsRace && bestMs < bestSecondaryLapMs)) {
      bestSecondaryLapMs = bestMs
      bestSecondaryStint = stint.stint_number
    }
  })

  if (bestSecondaryStint === null && stints.length > 0) {
    bestSecondaryStint = stints[0]?.stint_number ?? null
  }

  return {
    primaryStint,
    secondaryStint: bestSecondaryStint
  }
}
