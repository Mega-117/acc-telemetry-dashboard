/**
 * 05/11 (user: "+0.078 in red looks like danger"): how loud a time difference is. As the analysis tools do
 * (Trophi, Track Titan, Delta): differences as proportional bands against the largest one in the list, red
 * when you lose and green when you gain, always there (user 05/11: even a small one gets its band, and the
 * number with its sign is always written); only the biggest ones are loud.
 */
export type DeltaLevel = 'even' | 'small' | 'big'

/** Under five hundredths almost even; up to 0.15 s a small difference; from there a real one. */
export const EVEN_S = 0.05
export const BIG_S = 0.15

export function deltaLevel(seconds: number): DeltaLevel {
  const a = Math.abs(seconds)
  return a < EVEN_S ? 'even' : a < BIG_S ? 'small' : 'big'
}

/** Band length (0-100 %) of each difference against the largest in the list; any non-zero one is at least visible. */
export function deltaBars(seconds: number[]): number[] {
  const max = Math.max(0, ...seconds.map(s => Math.abs(s)))
  return seconds.map(s => max > 0 && s !== 0 ? Math.max(6, Math.round((Math.abs(s) / max) * 100)) : 0)
}
