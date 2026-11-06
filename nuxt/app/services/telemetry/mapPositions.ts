import type { LapTraceView } from './lapTraceChart'

// The smallest track drawn: below this the lap stayed in one place (06/11: a frame whose
// coordinates were all equal squeezed the whole map into its centre, labels piled up there).
const MIN_MAP_EXTENT_M = 50

/** True when the lap has coordinates that draw a track: spread over at least 50 m. */
export function hasMapPositions(trace: LapTraceView | null | undefined): boolean {
  const xs = trace?.channels.pos_x, zs = trace?.channels.pos_z
  if (!xs?.length || !zs?.length) return false
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < Math.min(xs.length, zs.length); i++) {
    const x = xs[i], z = zs[i]
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) continue
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return Math.max(maxX - minX, maxZ - minZ) >= MIN_MAP_EXTENT_M
}
