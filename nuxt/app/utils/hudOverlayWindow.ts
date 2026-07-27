export function normalizeHudRightGutter(value: unknown): number {
  const candidate = Array.isArray(value) ? value[0] : value
  const parsed = Number(candidate)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(Math.min(Math.max(parsed, 0), 64))
}
