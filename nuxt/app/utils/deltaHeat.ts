/**
 * The Telemetria's loss/gain cell colour (sectors, corners, the stint block): red when slower, green when
 * faster, stronger up to 0.15 s; near zero a neutral grey. One place, so every cell reads the same.
 */
export function deltaHeat(seconds: number): string {
  if (Math.abs(seconds) < 0.01) return 'rgba(255, 255, 255, 0.06)'
  const strength = (0.72 + 0.28 * Math.min((Math.abs(seconds) - 0.01) / 0.14, 1)).toFixed(2)
  return seconds > 0 ? `rgba(228, 0, 43, ${strength})` : `rgba(22, 163, 74, ${strength})`
}
