export interface UsageContext { game: string; track: string; car: string; mode: string; sessionType: string; version: string; channel: string }
export interface UsageSummary {
  schemaVersion: number; source: string; producer: string; day: string; context: UsageContext
  firstAt: number; lastAt: number; drivingMs: number; sessions: string[]; outcomes: Record<string, number>; features: string[]; partial: boolean
}
export interface UsageItem { key: string; uid: string; summary: UsageSummary | null }
export interface UsageDetail { producer: string; source: string; day: string; context: UsageContext; firstAt: number; lastAt: number; counters: Record<string, number>; durations: Record<string, number>; sessions: string[]; partial: boolean }
export interface UsageFilter { query: string; game: string; mode: string; sessionType: string; version: string; channel: string; includeTests: boolean }
export interface UsageUser { uid: string; lastAt: number; drivingMs: number; sessions: Set<string>; outcomes: Record<string, number>; features: Set<string>; partial: boolean; items: UsageItem[] }
// Usage statistics live 90 Rome days on the Worker; diagnostics keep their own 30.
export type UsagePeriod = 7 | 30 | 90
export function usageCalendarDays(count: UsagePeriod, now = new Date()): string[] {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]))
  const noon = Date.parse(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`)
  return Array.from({ length: count }, (_, i) => new Date(noon - (count - i - 1) * 86400000).toISOString().slice(0, 10))
}
export function filterUsage(items: UsageItem[], filter: UsageFilter, names: Record<string, string>, testUids: readonly string[]) {
  const search = filter.query.trim().toLocaleLowerCase('it')
  return items.filter(item => {
    if (!filter.includeTests && testUids.includes(item.uid)) return false
    if (search && !`${item.uid} ${names[item.uid] || ''}`.toLocaleLowerCase('it').includes(search)) return false
    return (['game', 'mode', 'sessionType', 'version', 'channel'] as const).every(k => !filter[k] || item.summary?.context[k] === filter[k])
  })
}
export function aggregateUsage(items: UsageItem[]): UsageUser[] {
  const users = new Map<string, UsageUser>()
  for (const item of items) {
    const u: UsageUser = users.get(item.uid) || { uid: item.uid, lastAt: 0, drivingMs: 0, sessions: new Set<string>(), outcomes: {}, features: new Set<string>(), partial: false, items: [] }
    u.items.push(item)
    const s = item.summary
    if (!s) u.partial = true
    else {
      u.lastAt = Math.max(u.lastAt, s.lastAt); u.drivingMs += s.drivingMs; u.partial ||= s.partial
      for (const id of s.sessions) u.sessions.add(`${s.producer}:${id}`)
      for (const f of s.features) u.features.add(f)
      for (const [k, v] of Object.entries(s.outcomes)) u.outcomes[k] = (u.outcomes[k] || 0) + v
    }
    users.set(item.uid, u)
  }
  return [...users.values()].sort((a, b) => b.lastAt - a.lastAt || a.uid.localeCompare(b.uid))
}
export function automationResult(outcomes: Record<string, number>) {
  const verified = outcomes.verified || 0
  const finished = ['verified', 'failed', 'partial', 'interrupted', 'cancelled'].reduce((sum, k) => sum + (outcomes[k] || 0), 0)
  const unknown = outcomes.unknown || 0, rejected = outcomes.rejected || 0
  return { verified, finished, unknown, rejected, ongoing: Math.max(0, (outcomes.started || 0) - finished - unknown - rejected), percent: finished ? Math.round(100 * verified / finished) : null }
}
export function usageDaily(items: UsageItem[], days: string[]) {
  return days.map(day => ({ day, observed: items.some(i => i.summary?.day === day),
    drivingMs: items.reduce((n, i) => n + (i.summary?.day === day ? i.summary.drivingMs : 0), 0) }))
}
export const usageHours = (ms: number) => (ms / 3600000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
