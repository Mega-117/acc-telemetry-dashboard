export interface FriendRequestCard { id: string; personId: string; nickname: string }
export interface FriendRequestSnapshot {
  session: string | null
  requests: FriendRequestCard[]
  busy: boolean
  error: string | null
}
export interface FriendRequestDecision { session: string; id: string; accept: boolean }
export interface FriendRequestBridge {
  localIdentityRole?: string
  friendRequestsPublish?: (state: FriendRequestSnapshot) => Promise<unknown>
  onFriendRequestDecision?: (callback: (decision: FriendRequestDecision) => void) => (() => void)
  friendRequestsGet?: () => Promise<FriendRequestSnapshot & { revision?: number }>
  onFriendRequestsState?: (callback: (state: FriendRequestSnapshot & { revision?: number }) => void) => (() => void)
  friendRequestsRespond?: (decision: FriendRequestDecision) => Promise<{ accepted: boolean; reason?: string }>
}

/** The authenticated renderer owns the queue. IPC carries projections, never credentials. */
export function createFriendRequestQueue(options: {
  publish: (state: FriendRequestSnapshot) => void
  respond: (personId: string, accept: boolean) => Promise<boolean>
  token: () => string
}) {
  let account: string | null = null
  let state: FriendRequestSnapshot = { session: null, requests: [], busy: false, error: null }
  const completed = new Set<string>()
  let lastPublication = ''
  function publish(force = false) {
    const signature = JSON.stringify(state)
    if (!force && signature === lastPublication) return
    lastPublication = signature
    options.publish({ ...state, requests: state.requests.map(row => ({ ...row })) })
  }
  function sync(uid: string | null, incoming: { personId: string; nickname: string }[]) {
    if (uid !== account) {
      account = uid
      completed.clear()
      state = { session: uid ? options.token() : null, requests: [], busy: false, error: null }
    }
    const rows = new Map((uid ? incoming : []).map(row => [row.personId, row]))
    for (const id of completed) if (!rows.has(id)) completed.delete(id)
    const previousHead = state.requests[0]?.id
    state.requests = state.requests.filter(row => (rows.has(row.personId) || ((state.busy || state.error) && row.id === previousHead)) && !completed.has(row.personId))
      .map(row => ({ ...row, nickname: rows.get(row.personId)?.nickname ?? row.nickname }))
    const existing = new Set(state.requests.map(row => row.personId))
    for (const row of rows.values()) if (!existing.has(row.personId) && !completed.has(row.personId)) {
      state.requests.push({ ...row, id: options.token() })
    }
    if (previousHead !== state.requests[0]?.id) state.error = null
    publish()
  }
  async function decide(decision: FriendRequestDecision) {
    const head = state.requests[0]
    if (!account || state.busy || !head || decision.session !== state.session || decision.id !== head.id
      || typeof decision.accept !== 'boolean') { publish(true); return }
    const session = state.session
    state.busy = true
    state.error = null
    publish()
    let ok = false
    try { ok = await options.respond(head.personId, decision.accept) } catch { /* Report failure in the same card. */ }
    if (state.session !== session) return
    state.busy = false
    if (ok) {
      completed.add(head.personId)
      state.requests = state.requests.filter(row => row.id !== head.id)
    } else if (state.requests.some(row => row.id === head.id)) {
      state.error = 'Risposta non confermata. Controlla la connessione e riprova.'
    }
    publish()
  }
  return { sync, decide }
}
