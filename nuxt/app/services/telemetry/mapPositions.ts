import type { LapTraceView } from './lapTraceChart'

// The smallest track drawn: below this the lap stayed in one place (06/11: a frame whose
// coordinates were all equal squeezed the whole map into its centre, labels piled up there).
const MIN_MAP_EXTENT_M = 50

function spread(xs: readonly (number | null | undefined)[], zs: readonly (number | null | undefined)[]): number {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < Math.min(xs.length, zs.length); i++) {
    const x = xs[i], z = zs[i]
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) continue
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return Math.max(maxX - minX, maxZ - minZ)
}

/** True when the lap has full coordinates that draw a track (spread over at least 50 m): it can frame the map. */
export function hasMapPositions(trace: LapTraceView | null | undefined): boolean {
  const xs = trace?.channels.pos_x, zs = trace?.channels.pos_z
  if (!xs?.length || !zs?.length) return false
  return spread(xs, zs) >= MIN_MAP_EXTENT_M
}

/**
 * PIP-760: the lap's own coordinates, full or recovered (partial: `null` where nothing was recorded), when the
 * recorded ones draw a track. Null when the lap has none (laps saved before late October, MoTeC laps).
 */
export function ownMapPositions(trace: LapTraceView | null | undefined): { xs: readonly (number | null)[], zs: readonly (number | null)[] } | null {
  const xs = trace?.channels.pos_x ?? trace?.partialChannels?.pos_x
  const zs = trace?.channels.pos_z ?? trace?.partialChannels?.pos_z
  if (!xs?.length || !zs?.length || xs.length !== zs.length) return null
  return spread(xs, zs) >= MIN_MAP_EXTENT_M ? { xs, zs } : null
}
