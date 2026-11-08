import type { PitwallRealtimeTransport } from './pitwallRealtimeTransport'
import { emitPitwallDiagnostic } from './pitwallDiagnostics'
import { pitwallIoErrorCode } from './pitwallIoMetrics'
import type { PitwallRoom } from './pitwallRoomContract'
import type { SocialDirectoryEntry } from './pitwallSocialLifecycle'

/**
 * Discovery of friends' rooms: directories, sponsor connections and admission
 * previews. Split from the membership lifecycle (PIP-750), which owns entries
 * and exits and shares the witnesses and the rooms being left.
 */
export function createPitwallSocialDiscovery(options: {
  uid: string
  io: PitwallRealtimeTransport
  witnesses: Map<string, SocialDirectoryEntry & { sponsorUid: string }>
  leaving: Set<string>
  discoveryChanges: Set<(roomId: string, pending: boolean) => void>
  watchRoom: (roomId: string, callback: (room: PitwallRoom | null) => void, error?: (error: Error) => void) => () => void
  watchFriends: (callback: (uids: string[]) => void, error?: (error: Error) => void) => () => void
  diagnostic: (event: string, roomId: string) => void
}) {
  const { uid, io, witnesses, leaving, discoveryChanges, watchRoom, diagnostic } = options
  function watchRooms(callback: (rooms: PitwallRoom[]) => void, error?: (error: Error) => void) {
    const directories = new Map<string, SocialDirectoryEntry>()
    const directoryStops = new Map<string, () => void>()
    const connectionStops = new Map<string, () => void>()
    const connections = new Map<string, Record<string, unknown>>()
    const roomStops = new Map<string, () => void>()
    const roomSources = new Map<string, string>()
    const rooms = new Map<string, PitwallRoom>()
    let stopped = false
    let version = 0
    let syncing = false
    let syncRequested = false
    const retries = new Map<string, { source: string, attempts: number, timer?: ReturnType<typeof setTimeout> }>()
    // PIP-750 F8: sponsors whose preview the Rules revoked, until their directory or connection changes.
    const revokedSponsors = new Set<string>()
    const emit = () => { if (!stopped) callback([...rooms.values()]) }
    const runSync = async () => {
      const generation = ++version
      const desired = new Map<string, Array<{ sponsorUid: string, entry: SocialDirectoryEntry }>>()
      for (const [sponsorUid, entry] of directories) {
        if (leaving.has(entry.roomId)) continue
        // The directory survives disconnect. Wait for an authoritative connection
        // snapshot before requesting admission; its listener also wakes discovery
        // when a directory arrives before its sponsor's presence.
        if (!connections.get(sponsorUid)?.[entry.connectionId] && !roomStops.has(entry.roomId)) continue
        const sources = desired.get(entry.roomId) ?? []
        sources.push({ sponsorUid, entry })
        desired.set(entry.roomId, sources)
      }
      for (const [id, stop] of roomStops) if (!desired.has(id)) { stop(); roomStops.delete(id); rooms.delete(id); witnesses.delete(id) }
      for (const [id, retry] of retries) if (!desired.has(id)) { clearTimeout(retry.timer); retries.delete(id) }
      for (const [roomId, sources] of desired) {
        const source = sources.map(({ sponsorUid, entry }) => `${sponsorUid}/${entry.connectionId}`).sort().join('|')
        if (roomStops.has(roomId) && roomSources.get(roomId) === source) continue
        // Existing membership or the same live sponsor already authorizes this
        // listener. A second friend entering must not rewrite admission and
        // download the room again.
        const witness = witnesses.get(roomId)
        const ownMembership = rooms.get(roomId)?.memberUids.includes(uid)
          && sources.some(value => value.sponsorUid === uid)
        const sameSponsor = witness && sources.some(value => value.sponsorUid === witness.sponsorUid
          && value.entry.connectionId === witness.connectionId)
        if (roomStops.has(roomId) && (ownMembership || sameSponsor)) {
          roomSources.set(roomId, source)
          continue
        }
        const retry = retries.get(roomId)
        if (retry?.source === source && (retry.timer || retry.attempts > 3)) continue
        if (retry && retry.source !== source) { clearTimeout(retry.timer); retries.delete(roomId) }
        roomStops.get(roomId)?.()
        roomStops.delete(roomId)
        try {
          // A logout leaves our directory behind. It must not mask a present
          // friend who can authorize the same room on the next login.
          let admitted = Boolean(ownMembership)
          for (const { sponsorUid, entry } of sources) {
            if (admitted) break
            if (stopped || generation !== version) return
            // PIP-750 F8: a sponsor whose preview the Rules revoked (its grace ended)
            // is skipped, so another present friend can admit this account.
            if (sponsorUid === uid || revokedSponsors.has(`${roomId}|${sponsorUid}/${entry.connectionId}`)) continue
            try {
              const witness = { ...entry, sponsorUid }
              await io.write(`admissions/${roomId}`, { [uid]: witness })
              if (stopped || generation !== version) return
              witnesses.set(roomId, witness)
              admitted = true
              break
            } catch (cause) {
              if (stopped || generation !== version || leaving.has(roomId)) return
              if (!/permission.?denied/i.test(String(cause))) throw cause
            }
          }
          if (!admitted && !sources.some(value => value.sponsorUid === uid)) {
            rooms.delete(roomId)
            // Rules may see the directory before occupancy. Retry a bounded number
            // of times, then wait for an actual directory/connection change.
            const state = retries.get(roomId) ?? { source, attempts: 0 }
            const delay = [250, 1000, 3000][state.attempts++]
            if (delay != null) state.timer = setTimeout(() => { state.timer = undefined; void sync() }, delay)
            retries.set(roomId, state)
            continue
          }
          const previousRetry = retries.get(roomId)
          clearTimeout(previousRetry?.timer); retries.delete(roomId)
          if (stopped || generation !== version || leaving.has(roomId)) return
          let failed = false
          let previewObserved = false
          let stop = () => {}
          const handle = () => stop()
          roomStops.set(roomId, handle)
          roomSources.set(roomId, source)
          stop = watchRoom(roomId, room => {
            if (roomStops.get(roomId) !== handle) return
            if (room) previewObserved = Boolean(witnesses.has(roomId) && !room.memberUids.includes(uid))
            if (room) rooms.set(roomId, room); else rooms.delete(roomId)
            emit()
          }, cause => {
            if (roomStops.get(roomId) !== handle) return
            failed = true; roomStops.delete(roomId); rooms.delete(roomId); stop(); emit()
            // A preview is authorized only while its sponsoring friend remains.
            // RTDB may cancel it before delivering that friend's directory removal.
            // Keep the transport denial in diagnostics; do not show a room fault
            // or retry admission for a preview that was previously valid.
            if (previewObserved && pitwallIoErrorCode(cause) === 'permission-denied') {
              const revoked = witnesses.get(roomId)
              if (revoked) revokedSponsors.add(`${roomId}|${revoked.sponsorUid}/${revoked.connectionId}`)
              witnesses.delete(roomId)
              diagnostic('room_preview_revoked', roomId)
              // F8: another present friend may still sponsor this room. The revoked
              // sponsor is skipped and the retry map bounds the attempts.
              void sync()
            } else error?.(cause)
          })
          if (failed) stop()
        } catch (cause) {
          rooms.delete(roomId)
          emitPitwallDiagnostic('room_access_denied', { roomId, uid, reason: String(cause) })
          error?.(cause instanceof Error ? cause : new Error(String(cause)))
        }
      }
      emit()
    }
    const sync = async () => {
      syncRequested = true
      if (syncing || stopped) return
      syncing = true
      try {
        while (syncRequested && !stopped) { syncRequested = false; await runSync() }
      } finally { syncing = false }
    }
    const resetRetries = () => {
      for (const retry of retries.values()) clearTimeout(retry.timer)
      retries.clear()
      revokedSponsors.clear()
    }
    const stopConnections = (id: string) => {
      connectionStops.get(id)?.(); connectionStops.delete(id); connections.delete(id)
    }
    const onLeaving = (roomId: string, pending: boolean) => {
      if (pending) {
        version++
        roomStops.get(roomId)?.(); roomStops.delete(roomId); roomSources.delete(roomId)
        rooms.delete(roomId); witnesses.delete(roomId)
        const retry = retries.get(roomId); clearTimeout(retry?.timer); retries.delete(roomId)
      } else { void sync() }
    }
    discoveryChanges.add(onLeaving)
    const stopFriends = options.watchFriends(friends => {
      const wanted = new Set([uid, ...friends])
      for (const [id, stop] of directoryStops) if (!wanted.has(id)) { stop(); directoryStops.delete(id); directories.delete(id); stopConnections(id) }
      for (const id of wanted) if (!directoryStops.has(id)) {
        let failed = false
        let stop = () => {}
        const handle = () => stop()
        directoryStops.set(id, handle)
        stop = io.watch(`directory/${id}`, value => {
          if (directoryStops.get(id) !== handle) return
          if (value) directories.set(id, value as SocialDirectoryEntry); else directories.delete(id)
          resetRetries()
          if (!value) stopConnections(id)
          else if (!connectionStops.has(id)) {
            let cancel = () => {}
            const connectionHandle = () => cancel()
            connectionStops.set(id, connectionHandle)
            cancel = io.watch(`connections/${id}`, current => {
              if (connectionStops.get(id) !== connectionHandle) return
              connections.set(id, (current ?? {}) as Record<string, unknown>)
              resetRetries(); void sync()
            }, cause => {
              if (connectionStops.get(id) !== connectionHandle) return
              stopConnections(id); void sync(); error?.(cause)
            })
            if (connectionStops.get(id) !== connectionHandle) cancel()
          }
          void sync()
        }, cause => {
          if (directoryStops.get(id) !== handle) return
          failed = true; directoryStops.delete(id); directories.delete(id); stopConnections(id); stop(); void sync(); error?.(cause)
        })
        if (failed) stop()
      }
      void sync()
    }, error)
    return () => { stopped = true; version++; discoveryChanges.delete(onLeaving); resetRetries(); stopFriends(); directoryStops.forEach(stop => stop()); connectionStops.forEach(stop => stop()); roomStops.forEach(stop => stop()); witnesses.clear() }
  }
  return watchRooms
}
