import type { Firestore } from 'firebase/firestore'
import { getPitwallRealtime } from '~/config/pitwallRealtime'
import { createPitwallProfileCache } from './pitwallProfileCache'
import { friendUidsFromGrants } from './pitwallFriends'
import { createPitwallEngineerService, type PitwallOutgoingLink, type PitwallIncomingRequest } from './pitwallEngineerService'
import { activeDriver, type RealtimeConnection } from './pitwallRealtimeProtocol'
import { buildPitwallGrantRequest, buildPitwallPreAuthorisation, isPitwallGrantUsable, PITWALL_GRANT_ONCE_DURATION_MS,
  type PitwallGrant, type PitwallGrantScope, type PitwallSession, type PitwallOrderDocument } from './pitwallLink'
import type { PitwallRealtimeTransport } from './pitwallRealtimeTransport'

const instances = new Map<string, ReturnType<typeof buildService>>()
export function createPitwallRealtimeEngineerService(options: { db: Firestore, engineerUid: string, io?: PitwallRealtimeTransport }) {
  if (options.io) return buildService(options.db, options.engineerUid, options.io)
  let service = instances.get(options.engineerUid)
  if (!service) { service = buildService(options.db, options.engineerUid, getPitwallRealtime()); instances.set(options.engineerUid, service) }
  return service
}
export function stopPitwallRealtimeEngineerAccount(uid: string) { instances.get(uid)?.dispose(); instances.delete(uid) }
const failure = (error: unknown): { ok: false, reason: string } => ({ ok: false, reason: error instanceof Error ? error.message : String(error) })

function buildService(db: Firestore, uid: string, io: PitwallRealtimeTransport) {
  const profiles = createPitwallProfileCache(db)
  // Search remains in the public Firestore directory. None of the old operational methods are called.
  const { searchUsers } = createPitwallEngineerService({ db, engineerUid: uid })
  const path = (driver: string, engineer: string) => `grants/${driver}/${engineer}`
  const valid = (grant: PitwallGrant | null) => !!grant && isPitwallGrantUsable(grant, grant.driverUid, grant.engineerUid, io.serverNow())
  const expiry = (value: number | null) => value != null && Number.isFinite(value) && value > io.serverNow() ? value : io.serverNow() + PITWALL_GRANT_ONCE_DURATION_MS
  const stamp = () => new Date(io.serverNow()).toISOString()
  const ownedStops = new Set<() => void>()

  async function requestLink(driverUid: string, requestedScope: PitwallGrantScope = 'once', note: string | null = null) {
    try {
      const existing = await io.read<PitwallGrant>(path(driverUid, uid))
      if (valid(existing)) return { ok: true as const, alreadyGranted: true }
      const request = buildPitwallGrantRequest(driverUid, uid, stamp(), note, requestedScope)
      if (!request) throw new Error('Pilota non valido.')
      await io.write('', { [path(driverUid, uid)]: request.data, [`outgoing/${uid}/${driverUid}`]: true })
      return { ok: true as const, alreadyGranted: false }
    } catch (error) { return failure(error) }
  }
  async function withdraw(driverUid: string) {
    try { await io.write(path(driverUid, uid), { status: 'revoked', updatedAt: stamp() }); return { ok: true as const } }
    catch (error) { return failure(error) }
  }
  async function decideRequest(engineer: string, decision: 'granted' | 'revoked', scope: PitwallGrantScope = 'always', expiresAtMs: number | null = null) {
    try {
      await io.write(path(uid, engineer), { status: decision, updatedAt: stamp(),
        ...(decision === 'granted' ? { scope, expiresAtMs: scope === 'once' ? expiry(expiresAtMs) : null } : {}) })
      return { ok: true as const }
    } catch (error) { return failure(error) }
  }
  async function preAuthorise(engineer: string, scope: PitwallGrantScope = 'always', expiresAtMs: number | null = null) {
    try {
      const grant = buildPitwallPreAuthorisation(uid, engineer, stamp())
      if (!grant) throw new Error('Utente non valido.')
      await io.write('', { [path(uid, engineer)]: { ...grant.data, scope, expiresAtMs: scope === 'once' ? expiry(expiresAtMs) : null }, [`outgoing/${engineer}/${uid}`]: true })
      return { ok: true as const }
    } catch (error) { return failure(error) }
  }
  async function updateGrantExpiry(engineer: string, expiresAtMs: number) {
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= io.serverNow()) return { ok: false as const, reason: 'La scadenza deve essere nel futuro.' }
    try { await io.write(path(uid, engineer), { scope: 'once', expiresAtMs, updatedAt: stamp() }); return { ok: true as const } }
    catch (error) { return failure(error) }
  }

  async function outgoingRows(grants: PitwallGrant[]): Promise<PitwallOutgoingLink[]> {
    return Promise.all(grants.map(async grant => ({ driverUid: grant.driverUid, nickname: await profiles.read(grant.driverUid),
      status: grant.status, scope: grant.scope ?? null, expiresAtMs: grant.expiresAtMs ?? null,
      requestedScope: grant.requestedScope ?? null, usable: valid(grant), session: null, reachable: false })))
  }
  async function incomingRows(grants: PitwallGrant[]): Promise<PitwallIncomingRequest[]> {
    return Promise.all(grants.map(async grant => ({ engineerUid: grant.engineerUid, nickname: await profiles.read(grant.engineerUid),
      status: grant.status, createdAt: grant.createdAt, scope: grant.scope ?? null, expiresAtMs: grant.expiresAtMs ?? null,
      requestedScope: grant.requestedScope ?? null })))
  }
  function watchOutgoingGrants(callback: (grants: PitwallGrant[]) => void, error?: (error: Error) => void) {
    const grants = new Map<string, PitwallGrant>()
    const stops = new Map<string, () => void>()
    const ready = new Set<string>()
    let indexReady = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const emit = () => {
      if (!indexReady || [...stops.keys()].some(id => !ready.has(id))) return
      if (timer) clearTimeout(timer)
      callback([...grants.values()])
      const future = [...grants.values()].map(value => value.scope === 'once' ? value.expiresAtMs ?? 0 : 0).filter(value => value > io.serverNow())
      // An expiry changes local usability; it does not read or write Firebase.
      if (future.length) timer = setTimeout(emit, Math.min(2_147_000_000, Math.max(1, Math.min(...future) - io.serverNow() + 1)))
    }
    const stopIndex = io.watch(`outgoing/${uid}`, value => {
      indexReady = false
      const ids = new Set(Object.keys((value ?? {}) as Record<string, true>))
      for (const [id, stop] of stops) if (!ids.has(id)) { stop(); stops.delete(id); grants.delete(id); ready.delete(id) }
      for (const id of ids) if (!stops.has(id)) {
        stops.set(id, () => {})
        stops.set(id, io.watch(path(id, uid), value => { ready.add(id); if (value) grants.set(id, value as PitwallGrant); else grants.delete(id); emit() }, cause => { ready.add(id); grants.delete(id); emit(); error?.(cause) }))
      }
      indexReady = true; emit()
    }, error)
    const stop = () => { stopIndex(); for (const unsubscribe of stops.values()) unsubscribe(); if (timer) clearTimeout(timer); ownedStops.delete(stop) }
    ownedStops.add(stop)
    return stop
  }
  function watchOutgoingLinks(callback: (links: PitwallOutgoingLink[]) => void, error?: (error: Error) => void) {
    let version = 0; let stopped = false; let dataReady = false; let grants: PitwallGrant[] = []
    const emit = async () => { if (!dataReady || stopped) return; const token = ++version; const rows = await outgoingRows(grants); if (!stopped && token === version) callback(rows) }
    const stopGrants = watchOutgoingGrants(values => { grants = values; dataReady = true; void emit().catch(error) }, error)
    const stopProfiles = profiles.onChange(() => { void emit().catch(error) })
    return () => { stopped = true; stopGrants(); stopProfiles() }
  }
  async function listOutgoingLinks() {
    const index = await io.read<Record<string, true>>(`outgoing/${uid}`)
    const grants = await Promise.all(Object.keys(index ?? {}).map(driver => io.read<PitwallGrant>(path(driver, uid))))
    return outgoingRows(grants.filter((grant): grant is PitwallGrant => grant != null))
  }
  function watchIncomingRequests(callback: (requests: PitwallIncomingRequest[]) => void, error?: (error: Error) => void) {
    let version = 0; let stopped = false; let dataReady = false; let grants: PitwallGrant[] = []
    const emit = async () => { if (!dataReady || stopped) return; const token = ++version; const rows = await incomingRows(grants); if (!stopped && token === version) callback(rows) }
    const stopData = io.watch(`grants/${uid}`, value => { grants = Object.values((value ?? {}) as Record<string, PitwallGrant>); dataReady = true; void emit().catch(error) }, error)
    const stopProfiles = profiles.onChange(() => { void emit().catch(error) })
    const stop = () => { stopped = true; stopData(); stopProfiles(); ownedStops.delete(stop) }
    ownedStops.add(stop)
    return stop
  }
  async function listIncomingRequests() { return incomingRows(Object.values(await io.read<Record<string, PitwallGrant>>(`grants/${uid}`) ?? {})) }
  function watchGrantedPilots(callback: (driverUids: string[]) => void, error?: (error: Error) => void) {
    return watchOutgoingGrants(grants => callback(grants.filter(valid).map(value => value.driverUid)), error)
  }
  function watchTrustedUids(callback: (uids: string[]) => void, error?: (error: Error) => void) {
    let incoming: PitwallGrant[] = []; let outgoing: PitwallGrant[] = []
    let readyIn = false; let readyOut = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const emit = () => {
      if (!readyIn || !readyOut) return
      if (timer) clearTimeout(timer)
      callback(friendUidsFromGrants(incoming, outgoing, uid, io.serverNow()))
      const future = incoming.map(grant => grant.scope === 'once' ? grant.expiresAtMs ?? 0 : 0).filter(stamp => stamp > io.serverNow())
      if (future.length) timer = setTimeout(emit, Math.min(2_147_000_000, Math.max(1, Math.min(...future) - io.serverNow() + 1)))
    }
    const stopIn = io.watch(`grants/${uid}`, value => { incoming = Object.values((value ?? {}) as Record<string, PitwallGrant>); readyIn = true; emit() }, error)
    const stopOut = watchOutgoingGrants(value => { outgoing = value; readyOut = true; emit() }, error)
    return () => { stopIn(); stopOut(); if (timer) clearTimeout(timer) }
  }

  function presenceState(driverUid: string, value: unknown): { session: PitwallSession | null, reachable: boolean } {
    const connection = activeDriver(Object.values((value ?? {}) as Record<string, RealtimeConnection>))
    if (!connection) return { session: null, reachable: false }
    const session: PitwallSession & { protocolVersion: 3 } = { protocolVersion: 3, schemaVersion: 1, driverUid,
      sessionId: connection.connectionId, roomId: connection.roomId, online: io.online(), updatedAt: connection.updatedAt, car: connection.car, track: connection.track }
    return { session, reachable: io.online() }
  }
  function watchPilotPresence(driverUid: string, callback: (state: { session: PitwallSession | null, reachable: boolean }) => void, error?: (error: Error) => void) {
    let known: unknown = null
    const stop = io.watch(`connections/${driverUid}`, value => { known = value; callback(presenceState(driverUid, value)) }, cause => { known = null; callback({ session: null, reachable: false }); error?.(cause) })
    const stopOnline = io.onConnection(online => { callback(online ? presenceState(driverUid, known) : { session: null, reachable: false }) })
    return () => { stop(); stopOnline() }
  }
  async function readPilotPresence(driverUid: string) {
    try { return presenceState(driverUid, await io.read(`connections/${driverUid}`)) }
    catch { return { session: null, reachable: false } }
  }
  async function listLinkedPilots() {
    const links = await listOutgoingLinks()
    return Promise.all(links.filter(link => link.usable).map(async link => ({ driverUid: link.driverUid, nickname: link.nickname,
      grant: (await io.read<PitwallGrant>(path(link.driverUid, uid)))!, ...await readPilotPresence(link.driverUid) })))
  }
  async function sendOrder(_input: unknown): Promise<{ ok: false, reason: string } | { ok: true, orderId: string }> {
    return { ok: false, reason: 'Apri la stanza Pitwall per inviare la strategia con il nuovo protocollo.' }
  }
  function watchOrder(_driverUid: string, _orderId: string, callback: (order: (PitwallOrderDocument & { result?: unknown, appliedAt?: string }) | null) => void) { callback(null); return () => {} }
  function dispose() { for (const stop of [...ownedStops]) stop(); profiles.stop() }
  return { requestLink, withdraw, decideRequest, preAuthorise, updateGrantExpiry, listOutgoingLinks, watchOutgoingLinks,
    listIncomingRequests, watchIncomingRequests, watchGrantedPilots, listLinkedPilots, watchPilotPresence, readPilotPresence,
    searchUsers, sendOrder, watchOrder, watchTrustedUids, nicknameOf: profiles.read, dispose }
}
