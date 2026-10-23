import { DIAGNOSTICS_INGEST_ORIGIN, resolveDiagnosticsOrigin } from '~/repositories/diagnosticBundlesRepository'

// PIP-591 (X-A07-19): come i pacchetti diagnostici, Utilizzo usa il Worker configurato
// (NUXT_PUBLIC_DIAGNOSTICS_INGEST_URL, es. Worker locale nei collaudi) e solo altrimenti la
// produzione. Fuori da un contesto Nuxt (test, chiamate tardive) resta la produzione.
export function usageOrigin(): string {
  try { return resolveDiagnosticsOrigin(useRuntimeConfig().public.diagnosticsIngestUrl) } catch { return DIAGNOSTICS_INGEST_ORIGIN }
}
import { createUsageCollector } from './usageCore.js'

export interface UsagePreference { enabled: boolean; revision: number }
export interface UsageSignal { feature: string; active?: boolean; event?: string; id?: string }
type User = { uid: string; getIdToken: () => Promise<string> }
type Bridge = { recordUsage?: (event: UsageSignal) => void; usagePreference?: (enabled?: boolean) => Promise<UsagePreference> }
let user: User | null = null
let stopProducer = () => {}
let deliver: ((event: UsageSignal) => void) | null = null
let preferenceGeneration = 0
let bindingGeneration = 0
const bridge = () => typeof window === 'undefined' ? null : (window as Window & { electronAPI?: Bridge }).electronAPI

// PIP-591: il "no" dell'utente vale subito, prima in memoria. localStorage pieno o bloccato
// (QuotaExceededError, SecurityError) non deve lasciare la raccolta accesa mentre la UI dice spenta.
const disabledInMemory = new Set<string>()
const pendingInMemory = new Set<string>()
const storageGet = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const storageSet = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* veto in memoria */ } }
const storageRemove = (key: string) => { try { localStorage.removeItem(key) } catch { /* best effort */ } }
const isDisabled = (owner: string) => disabledInMemory.has(owner) || !!storageGet(`rc-usage-disabled:${owner}`)
const isPending = (owner: string) => pendingInMemory.has(owner) || !!storageGet(`rc-usage-pending-disable:${owner}`)
function setDisabled(owner: string, disabled: boolean) {
  if (disabled) { disabledInMemory.add(owner); storageSet(`rc-usage-disabled:${owner}`, '1') }
  else { disabledInMemory.delete(owner); storageRemove(`rc-usage-disabled:${owner}`) }
}
function clearPending(owner: string) { pendingInMemory.delete(owner); storageRemove(`rc-usage-pending-disable:${owner}`) }
// Impostata da bindUsageUser: avvisa le altre schede dello stesso account (BroadcastChannel).
let sharePreference: ((disabled: boolean, pending: boolean) => void) | null = null

export async function usageRequest(route: string, body?: unknown, isCurrent: () => boolean = () => true): Promise<any> {
  const captured = user, generation = bindingGeneration
  if (!captured) throw Error('Accedi per gestire le statistiche di utilizzo.')
  const check = () => {
    if (user?.uid !== captured.uid || generation !== bindingGeneration || !isCurrent()) throw Error('Account cambiato o raccolta interrotta.')
  }
  check()
  const token = await captured.getIdToken()
  check()
  const response = await fetch(`${usageOrigin()}${route}`, { method: body === undefined ? 'GET' : 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw Error(`Statistiche di utilizzo non disponibili (${response.status}).`)
  const value = await response.json()
  check()
  return value
}
export async function usagePreference(enabled?: boolean): Promise<UsagePreference> {
  if (bridge()?.usagePreference) return bridge()!.usagePreference!(enabled)
  if (!user) throw Error('Account non disponibile.')
  const owner = user.uid
  const generation = enabled === undefined ? preferenceGeneration : ++preferenceGeneration
  if (enabled === false) {
    setDisabled(owner, true)
    pendingInMemory.add(owner); storageSet(`rc-usage-pending-disable:${owner}`, '1')
    sharePreference?.(true, true)
    window.dispatchEvent(new Event('rc-usage-preference'))
  }
  const result = await usageRequest('/v1/usage/preference', enabled === undefined ? undefined : { enabled })
  if (generation !== preferenceGeneration) throw Error('Preferenza cambiata durante la richiesta.')
  if (enabled !== undefined) clearPending(owner)
  setDisabled(owner, !result.enabled)
  sharePreference?.(!result.enabled, isPending(owner))
  window.dispatchEvent(new Event('rc-usage-preference'))
  return result
}
export function recordUsage(event: UsageSignal) {
  // Analytics never propagates an error into audio or Pitwall.
  try { if (bridge()) bridge()?.recordUsage?.(event); else deliver?.(event) } catch { /* observer */ }
}

export function bindUsageUser(next: User | null) {
  if (user?.uid === next?.uid) { user = next; return }
  bindingGeneration++
  stopProducer(); user = next; deliver = null
  if (!next || bridge() || !navigator.locks || typeof BroadcastChannel === 'undefined') return
  const owner = next.uid, tab = crypto.randomUUID(), storageKey = `rc-usage:${owner}`
  const channel = new BroadcastChannel(`rc-usage:${owner}`)
  const states = new Map<string, boolean>()
  const remoteStates = new Map<string, { feature: string; at: number; active: boolean }>()
  let collector: ReturnType<typeof createUsageCollector> | null = null
  let ended = false, attempting = false, release = () => {}, preference: UsagePreference | null = null, uploading = false
  const acks = new Map<string, number>()
  function persist() {
    if (!collector) return
    try { localStorage.setItem(storageKey, JSON.stringify(collector.checkpoint())) } catch { /* quota: no crash */ }
  }
  function receive(message: { tab: string; value: UsageSignal }) {
    if (!collector || preference?.enabled !== true || isDisabled(owner)) return
    const value = message?.value
    if (!value || !['pitwall.driver', 'pitwall.engineer'].includes(value.feature)) return
    if (typeof value.active === 'boolean') {
      remoteStates.set(`${message.tab}:${value.feature}`, { feature: value.feature, at: Date.now(), active: value.active })
      collector.setActive(value.feature, [...remoteStates.values()].some(s => s.feature === value.feature && s.active && Date.now() - s.at < 30000))
    } else collector.count(value.feature, value.event, value.id)
  }
  deliver = value => {
    if (typeof value.active === 'boolean') states.set(value.feature, value.active)
    const message = { tab, value }; channel.postMessage(message); receive(message)
  }
  // PIP-591: la scelta fatta in un'altra scheda arriva anche qui, pure se localStorage l'ha rifiutata.
  channel.onmessage = e => {
    const shared = e.data?.preference
    if (shared && typeof shared.disabled === 'boolean') {
      // Una richiesta di preferenza partita prima di questo messaggio non deve piu' poterlo annullare.
      preferenceGeneration++
      if (shared.disabled) disabledInMemory.add(owner); else disabledInMemory.delete(owner)
      if (shared.pending) pendingInMemory.add(owner); else pendingInMemory.delete(owner)
      onPreference()
      return
    }
    receive(e.data)
  }
  sharePreference = (disabled, pending) => { try { channel.postMessage({ preference: { disabled, pending } }) } catch { /* closed */ } }
  function onPreference() {
    if (isDisabled(owner)) {
      preference = { enabled: false, revision: preference?.revision || 0 }
      collector?.setIdentity(owner, { enabled: false }); storageRemove(storageKey)
    }
  }
  window.addEventListener('storage', onPreference)
  window.addEventListener('rc-usage-preference', onPreference)
  async function refresh() {
    if (!collector || ended || user?.uid !== owner) return
    const generation = preferenceGeneration, pending = isPending(owner)
    const result = await usageRequest('/v1/usage/preference', pending ? { enabled: false } : undefined)
    if (ended || user?.uid !== owner || !collector || generation !== preferenceGeneration || (!pending && isPending(owner))) return
    preference = result; collector.setIdentity(owner, result)
    clearPending(owner)
    setDisabled(owner, !result.enabled)
    // Conferma del server: le altre schede smettono di ritentare l'opt-out (niente pending vecchi in memoria).
    sharePreference?.(!result.enabled, false)
    if (!result.enabled) storageRemove(storageKey)
  }
  async function flush() {
    if (uploading || !collector) return
    uploading = true
    try {
      await refresh()
      if (preference?.enabled !== true || !collector) return
      const generation = preferenceGeneration, revision = preference.revision
      const isCurrent = () => !ended && user?.uid === owner && generation === preferenceGeneration
        && preference?.enabled === true && preference.revision === revision && !isDisabled(owner)
      persist()
      for (const row of collector.exportState().rows.filter((r: { owner: string; preferenceRevision: number }) => r.owner === owner && r.preferenceRevision === preference?.revision)) {
        if (!isCurrent()) break
        const bytes = new TextEncoder().encode(row.localKey)
        const hash = await crypto.subtle.digest('SHA-256', bytes)
        if (!isCurrent()) break
        const id = [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('').slice(0, 24)
        const key = `${row.producer}:${id}`
        if (acks.get(key) === row.revision) continue
        const body = { ...row }
        delete body.localKey
        delete body.owner
        await usageRequest(`/v1/usage/summaries/${row.producer}/${id}`, body, isCurrent)
        acks.set(key, row.revision)
      }
    } catch { /* durable snapshots retry on next tick */ }
    finally { uploading = false }
  }
  async function acquire() {
    if (attempting || ended || collector) return
    attempting = true
    try {
      await navigator.locks.request(`rc-usage:${owner}`, { ifAvailable: true }, async lock => {
        if (!lock || ended) return
        let initial = null
        try { initial = JSON.parse(localStorage.getItem(storageKey) || 'null') } catch { /* malformed local data */ }
        collector = createUsageCollector({ producer: /^[a-zA-Z0-9_-]{8,80}$/.test(initial?.producer || '') ? initial.producer : crypto.randomUUID(), source: 'browser', initial })
        void refresh().catch(() => {})
        await new Promise<void>(resolve => { release = resolve; if (ended) resolve() })
        collector.stop(); persist(); collector = null
      })
    } finally { attempting = false }
  }
  const heartbeat = window.setInterval(() => {
    void acquire()
    for (const [feature, active] of states) deliver?.({ feature, active })
    for (const [key, state] of remoteStates) if (Date.now() - state.at > 30000) remoteStates.delete(key)
    if (collector) for (const feature of ['pitwall.driver', 'pitwall.engineer']) collector.setActive(feature,
      [...remoteStates.values()].some(s => s.feature === feature && s.active && Date.now() - s.at < 30000))
  }, 10000)
  const checkpoint = window.setInterval(() => { persist(); void refresh().catch(() => {}) }, 60000)
  const upload = window.setInterval(() => { void flush() }, 300000)
  void acquire()
  stopProducer = () => {
    // Si ferma una volta sola: dopo un logout il canale e' chiuso e un secondo postMessage lancerebbe InvalidStateError.
    if (ended) return
    ended = true; for (const [feature] of states) channel.postMessage({ tab, value: { feature, active: false } })
    collector?.stop(); persist(); release(); sharePreference = null; channel.close()
    clearInterval(heartbeat); clearInterval(checkpoint); clearInterval(upload)
    window.removeEventListener('storage', onPreference); window.removeEventListener('rc-usage-preference', onPreference)
    window.removeEventListener('pagehide', onPageHide)
  }
  function onPageHide() {
    for (const [feature] of states) {
      const message = { tab, value: { feature, active: false } }
      channel.postMessage(message); receive(message)
    }
    persist()
  }
  window.addEventListener('pagehide', onPageHide)
}
