import { recordingGame } from './gameIdentity'

/** Mathematical facts only; eligibility is recorded, never inferred from ACC rules. */
export function commonSessionAnalysis(raw: unknown) {
  const gameId = recordingGame(raw)
  const session = raw as Record<string, any> | null
  if (!gameId || session?.schema !== 'racercore.session' || session.version !== 1) return null
  const laps: Record<string, any>[] = (Array.isArray(session.stints) ? session.stints : [])
    .flatMap((stint: any) => Array.isArray(stint?.laps) ? stint.laps : []).filter((lap: any) => lap && typeof lap === 'object')
  const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
  const eligible = laps.filter(lap => lap.completeness === 'complete' && lap.validity === 'valid'
    && lap.is_valid === true && positive(lap.lap_time_ms))
  const times: number[] = eligible.map(lap => lap.lap_time_ms)
  const averageMs = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null
  const sectorCounts = new Set(eligible.map(lap => Array.isArray(lap.sector_times_ms) ? lap.sector_times_ms.length : 0))
  const sectorCount = sectorCounts.size === 1 ? [...sectorCounts][0]! : 0
  const completeSectors = sectorCount > 0 && eligible.every(lap => lap.sector_times_ms.every(positive)
    && Math.abs(lap.sector_times_ms.reduce((a: number, b: number) => a + b, 0) - lap.lap_time_ms) <= 5)
  const bestSectorsMs = completeSectors
    ? Array.from({ length: sectorCount }, (_, index) => Math.min(...eligible.map(lap => lap.sector_times_ms[index]))) : []
  return { gameId, recordedLaps: laps.length, eligibleLaps: times.length,
    bestMs: times.length ? Math.min(...times) : null, averageMs,
    consistencyMs: times.length >= 2 ? Math.sqrt(times.reduce((sum, time) => sum + (time - averageMs!) ** 2, 0) / times.length) : null,
    bestSectorsMs, theoreticalMs: bestSectorsMs.length ? bestSectorsMs.reduce((a, b) => a + b, 0) : null,
  }
}
