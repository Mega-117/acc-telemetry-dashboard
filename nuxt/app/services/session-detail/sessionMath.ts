export function timeToSeconds(time: string | undefined): number {
  if (!time) return 0
  const parts = time.split(':')
  const minutes = Number(parts[0]) || 0
  const seconds = Number(parts[1]) || 0
  return minutes * 60 + seconds
}

export function secondsToTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds % 60).toFixed(3).padStart(6, '0')}`
}

/** Match persisted history: average integer milliseconds, dropping sub-ms remainder. */
export function averageLapMilliseconds(times: readonly number[]): number | null {
  if (!times.length) return null
  return Math.trunc(times.reduce((sum, ms) => sum + Math.round(ms), 0) / times.length)
}
