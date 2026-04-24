import { timeToSeconds } from '~/services/session-detail/sessionMath'

export function buildBestSectorSummary(laps: any[]) {
  let bestS1 = Infinity
  let bestS2 = Infinity
  let bestS3 = Infinity
  let bestLapMs = Infinity

  for (const lap of laps || []) {
    if (!lap.valid || lap.pit) continue
    const sectors = lap.sector_times_ms || []
    if (sectors[0] && sectors[0] > 0 && sectors[0] < bestS1) bestS1 = sectors[0]
    if (sectors[1] && sectors[1] > 0 && sectors[1] < bestS2) bestS2 = sectors[1]
    if (sectors[2] && sectors[2] > 0 && sectors[2] < bestS3) bestS3 = sectors[2]
    const lapMs = lap.lap_time_ms || lap.lapTimeMs
    if (lapMs && lapMs > 0 && lapMs < bestLapMs) {
      bestLapMs = lapMs
    }
  }

  return {
    s1: bestS1 === Infinity ? null : bestS1,
    s2: bestS2 === Infinity ? null : bestS2,
    s3: bestS3 === Infinity ? null : bestS3,
    lapMs: bestLapMs === Infinity ? null : bestLapMs
  }
}

export function buildComparisonRows(params: {
  lapsA: any[]
  lapsB: any[]
}) {
  const { lapsA, lapsB } = params
  const maxLaps = Math.max(lapsA.length, lapsB.length)
  const rows = []

  for (let index = 0; index < maxLaps; index++) {
    const lapA = lapsA[index] || null
    const lapB = lapsB[index] || null
    let delta: number | null = null

    if (lapA && lapB) {
      const timeA = timeToSeconds(lapA.time || lapA.lapTime || '')
      const timeB = timeToSeconds(lapB.time || lapB.lapTime || '')
      if (timeA > 0 && timeB > 0) {
        delta = timeA - timeB
      }
    }

    rows.push({
      index: index + 1,
      lapA,
      lapB,
      delta,
      deltaFormatted: delta !== null ? (delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3)) : '—',
      deltaClass: delta !== null ? (delta < 0 ? 'faster' : delta <= 0.3 ? 'close' : delta <= 0.5 ? 'margin' : 'far') : 'neutral',
      _isStintStartA: lapA?._isStintStart || false,
      _isStintStartB: lapB?._isStintStart || false,
      _stintNumberA: lapA?._stintNumber || null,
      _stintNumberB: lapB?._stintNumber || null
    })
  }

  return rows
}
