import { createLocalDiagnostic, type LocalClientDiagnostic } from './clientDiagnosticsService'

export const DIAGNOSTIC_DAY_MS = 86400000
const DAY = DIAGNOSTIC_DAY_MS
type Report = { event: LocalClientDiagnostic, owner: string | null, key: string, first: number, last: number, count: number, reserved: boolean, next: number, attempts: number }
export type DiagnosticState = { installation: string, reports: Report[], deliveries: Record<string, number>, suspended: number, discarded: number }
export const newDiagnosticState = (): DiagnosticState => ({ installation: crypto.randomUUID(), reports: [], deliveries: {}, suspended: 0, discarded: 0 })

// All mutations are synchronous and run inside one IndexedDB readwrite
// transaction. Cross-tab serialization needs neither a leader nor a timer lock.
export function diagnosticPolicy(state: DiagnosticState, now: number) {
  const oldLength = state.reports.length
  state.reports = state.reports.filter(row => row.first >= now - 30 * DAY)
    .sort((a, b) => a.first - b.first || a.event.eventId!.localeCompare(b.event.eventId!)).slice(-500)
  state.discarded += oldLength - state.reports.length
  for (const [id, at] of Object.entries(state.deliveries)) {
    if (at <= now - DAY && !state.reports.some(row => row.event.eventId === id && row.reserved)) delete state.deliveries[id]
  }
  const snapshot = (row: Report): LocalClientDiagnostic => ({ ...row.event, owner: row.owner,
    context: { ...row.event.context, _aggVersion: 1, _aggCount: row.count,
      _aggFirst: new Date(row.first).toISOString(), _aggLast: new Date(row.last).toISOString() } })
  return {
    capture(input: LocalClientDiagnostic, owner: string | null) {
      const event = createLocalDiagnostic(input)
      event.occurredAt = new Date(now).toISOString()
      const normalize = (text: string) => text.toLowerCase()
        .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/g, '<id>')
        .replace(/\b0x[0-9a-f]+\b/g, '<address>').replace(/\b\d+\b/g, '#')
      const key = JSON.stringify([owner, state.installation, input.suite || null, event.component, event.code, normalize(event.message), normalize(event.stack)])
      const row = state.reports.find(row => row.key === key && row.first <= now && row.first + DAY > now && !row.reserved)
      if (row) {
        row.count++
        row.last = now
        const rank = { warning: 0, error: 1, fatal: 2 }
        if (rank[event.severity] > rank[row.event.severity!]) row.event.severity = event.severity
      } else {
        event.context = Object.fromEntries(Object.entries(event.context).filter(([key]) => !key.startsWith('_agg')).slice(0, 8))
        state.reports.push({ event: { ...event, suite: input.suite || null, channel: input.channel || null }, owner, key, first: now, last: now, count: 1, reserved: false, next: 0, attempts: 0 })
        if (state.reports.length > 500) { state.reports.shift(); state.discarded++ }
      }
      return true
    },
    list(owner: string) {
      return now < state.suspended ? [] : state.reports.filter(row => row.owner === owner && row.first + DAY <= now && row.next <= now).slice(0, 50).map(snapshot)
    },
    reserve(id: string, owner: string) {
      const row = state.reports.find(row => row.event.eventId === id && row.owner === owner)
      if (!row || row.first + DAY > now || row.next > now || state.suspended > now) return null
      if (!(id in state.deliveries) && Object.keys(state.deliveries).length >= 20) return null
      state.deliveries[id] = now
      row.reserved = true
      row.next = now + 3600000
      return snapshot(row)
    },
    acknowledge(id: string, owner: string) {
      const index = state.reports.findIndex(row => row.event.eventId === id && row.owner === owner && row.reserved)
      if (index < 0) return 0
      state.reports.splice(index, 1)
      state.deliveries[id] = now
      return 1
    },
    failed(id: string, owner: string, quota: boolean) {
      const row = state.reports.find(row => row.event.eventId === id && row.owner === owner && row.reserved)
      if (!row) return
      row.next = now + (quota ? DAY : [60000, 300000, 900000, 3600000][Math.min(row.attempts++, 3)]!)
      if (quota) state.suspended = now + DAY
    }
  }
}

export function createBrowserDiagnosticStore(factory: IDBFactory = indexedDB, now = Date.now) {
  let database: Promise<IDBDatabase> | null = null
  let lastNotice = -Infinity
  function open() {
    if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('acc-client-diagnostics', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('state')
      request.onerror = () => { database = null; reject(request.error) }
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); database = null }
        resolve(request.result)
      }
    })
    return database
  }
  async function transact<T>(action: (policy: ReturnType<typeof diagnosticPolicy>) => T): Promise<T> {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite')
      const store = tx.objectStore('state')
      const request = store.get('diagnostics')
      let result: T
      tx.onabort = () => reject(tx.error || new Error('diagnostic_transaction_aborted'))
      tx.onerror = () => reject(tx.error)
      tx.oncomplete = () => resolve(result)
      request.onsuccess = () => {
        try {
          const state: DiagnosticState = request.result || newDiagnosticState()
          result = action(diagnosticPolicy(state, now()))
          store.put(state, 'diagnostics')
          if (state.discarded && now() - lastNotice >= 3600000) {
            lastNotice = now()
            console.warn(`[DIAGNOSTICS LOCAL] ${state.discarded} aggregates discarded by retention/capacity limits.`)
          }
        } catch { tx.abort() }
      }
    })
  }
  return {
    capture: (event: LocalClientDiagnostic, owner: string | null) => transact(policy => policy.capture(event, owner)),
    list: (owner: string) => transact(policy => policy.list(owner)),
    reserve: (id: string, owner: string) => transact(policy => policy.reserve(id, owner)),
    acknowledge: (id: string, owner: string) => transact(policy => policy.acknowledge(id, owner)),
    failed: (id: string, owner: string, quota: boolean) => transact(policy => policy.failed(id, owner, quota))
  }
}
