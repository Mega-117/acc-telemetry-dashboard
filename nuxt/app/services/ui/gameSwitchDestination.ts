/** Detail identities belong to one simulator; keep list sections, never map IDs. */
export function gameSwitchDestination(path: string): string | null {
  if (/^\/sessioni\/[^/]+\/?$/.test(path)) return '/sessioni'
  if (/^\/piste\/[^/]+\/?$/.test(path)) return '/piste'
  return null
}
