export function pointScopedId(point: { id?: string; game_id?: string; track_variant?: string | null } | null | undefined) {
  return JSON.stringify([point?.game_id ?? 'acc', point?.track_variant ?? null, String(point?.id || '')])
}
