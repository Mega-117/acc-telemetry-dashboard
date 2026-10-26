// PIP-623: da dove arrivano i giri della Telemetria. Ogni giro ha un descrittore esplicito
// (numero, tempo, sessione, proprietario, origine): il pannello non deduce piu' l'identita'
// dal nome del file, e i giri di altre origini (pilota del coach, i miei, condivisi) non si
// confondono con quelli della sessione mostrata.
import { listPilotLaps, fetchPilotLap, type LapsArchiveDeps } from './lapsArchiveClient'

export type LapOrigin = 'local' | 'pilot' | 'own' | 'shared'

export interface LapDescriptor {
  id: string
  lapNumber: number
  lapTimeMs: number
  /** null = da decidere con i giri della sessione (solo per l'origine locale). */
  valid: boolean | null
  sessionToken: string
  ownerUid: string | null
  origin: LapOrigin
}

export interface LapSource {
  list(sessionToken: string): Promise<LapDescriptor[]>
  read(descriptor: LapDescriptor): Promise<unknown>
}

export interface LocalLapBridge {
  listLapTraces?: (filter?: { sessionToken?: string, track?: string, car?: string }) => Promise<{ id: string }[] | null>
  readLapTrace?: (id: string) => Promise<unknown>
}

const LOCAL_ID = /(?:^|\/)lap_(\d{8}_\d{6})_L(\d{3})_(\d+)ms\.json\.gz$/

export function parseLocalLapId(id: string): { sessionToken: string, lapNumber: number, lapTimeMs: number } | null {
  const match = LOCAL_ID.exec(id)
  return match ? { sessionToken: match[1]!, lapNumber: Number(match[2]), lapTimeMs: Number(match[3]) } : null
}

function localDescriptors(items: { id: string }[] | null, origin: LapOrigin): LapDescriptor[] {
  return (items ?? []).flatMap((item) => {
    const parsed = parseLocalLapId(item.id)
    return parsed ? [{ id: item.id, ...parsed, valid: null, ownerUid: null, origin }] : []
  })
}

/** Giri del PC (la sessione mostrata), letti tramite Electron. */
export function electronLapSource(bridge: LocalLapBridge): LapSource {
  return {
    async list(sessionToken) { return localDescriptors(await bridge.listLapTraces!({ sessionToken }), 'local') },
    async read(descriptor) { return bridge.readLapTrace!(descriptor.id) },
  }
}

/** I miei giri sul PC per la stessa pista e auto (il coach li usa come riferimento). */
export async function listOwnLaps(bridge: LocalLapBridge, track: string, car: string): Promise<LapDescriptor[]> {
  if (typeof bridge.listLapTraces !== 'function') return []
  return localDescriptors(await bridge.listLapTraces({ track, car }), 'own').map(d => ({ ...d, id: `own:${d.id}` }))
}

/** Giri di una sessione del pilota collegato, dall'archivio online (vista coach). */
export function pilotLapSource(pilotUid: string, deps: LapsArchiveDeps): LapSource {
  return {
    async list(sessionToken) {
      const laps = await listPilotLaps(pilotUid, sessionToken, deps)
      return laps.flatMap((lap) => lap.lapId && lap.lapNumber !== null && lap.lapTimeMs !== null
        ? [{ id: `pilot:${lap.lapId}`, lapNumber: lap.lapNumber, lapTimeMs: lap.lapTimeMs, valid: lap.valid, sessionToken, ownerUid: pilotUid, origin: 'pilot' as const }]
        : [])
    },
    async read(descriptor) {
      return (await fetchPilotLap(pilotUid, descriptor.sessionToken, descriptor.id.replace(/^pilot:/, ''), deps)).trace
    },
  }
}
