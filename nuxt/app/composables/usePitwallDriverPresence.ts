// ============================================
// Lato pilota del Pit Wall, nella finestra principale.
//
// Deve girare qui e non nella finestra runtime: quella e' un consumer attestato
// senza utente Firebase proprio (decisione PIP-317), e senza autenticazione le
// regole Firestore negano perfino la lettura del permesso. La finestra
// principale possiede la sessione, quindi e' l'unica che puo' davvero fare
// questo lavoro.
//
// L'identita' del pilota arriva dal processo main, non da un secondo
// osservatore di Firebase Auth: una sola fonte di verita' per chi e' loggato.
// ============================================

import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { collection, doc, limit, query, where } from 'firebase/firestore'
import { db } from '~/config/firebase'
// Ogni lettura passa dal tracker: la promessa costo zero regge solo se il
// consumo Firebase resta misurabile, non stimato a occhio.
import { trackedGetDoc, trackedGetDocs } from '~/composables/useFirebaseTracker'
import {
  startPitwallDriverLink,
  type PitwallDriverElectronApi,
  type PitwallDriverLinkHandle,
} from '~/services/pitwall/pitwallDriverLinkService'
import {
  startPitwallRoomDriver,
  type PitwallRoomDriverHandle,
} from '~/services/pitwall/pitwallRoomDriverService'
import { isPitwallGrantUsable, type PitwallGrant } from '~/services/pitwall/pitwallLink'

interface PitwallElectronBridge extends PitwallDriverElectronApi {
  localIdentityRole?: string
}

function electronBridge(): PitwallElectronBridge | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { electronAPI?: PitwallElectronBridge }).electronAPI ?? null
}

/** Identifica questa esecuzione dell'app: cambia a ogni avvio. */
function newSessionId(): string {
  return `pw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export interface PitwallDriverPresenceOptions {
  /**
   * Il proprietario dei lavori cloud, gia' istanziato dalla shell.
   * Si riceve invece di crearne un secondo: due controllori di lease
   * competerebbero fra loro sullo stesso account.
   */
  jobsEnabled: Ref<boolean>
}

export function usePitwallDriverPresence(options: PitwallDriverPresenceOptions) {
  const active = ref(false)
  const driverUid = ref<string | null>(null)
  const unavailableReason = ref<string | null>(null)
  /** La gara in cui siamo adesso, per poterla mostrare al pilota. */
  const roomId = ref<string | null>(null)
  let handle: PitwallDriverLinkHandle | null = null
  let roomHandle: PitwallRoomDriverHandle | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function stop(): void {
    if (roomHandle) {
      void roomHandle.goOffline()
      roomHandle.stop()
      roomHandle = null
      roomId.value = null
    }
    if (!handle) return
    void handle.goOffline()
    handle.stop()
    handle = null
    active.value = false
  }

  /**
   * Il soprannome pubblico di questo account: e' quello che gli altri membri
   * leggeranno nella stanza. Se non e' leggibile si mostra l'identificativo,
   * che e' brutto ma vero, invece di inventare un nome.
   */
  async function readNickname(uid: string): Promise<string> {
    try {
      const profile = await trackedGetDoc(doc(db, 'publicProfiles', uid), 'pitwallRoom.selfProfile')
      if (profile.exists()) return String((profile.data() as { nickname?: string }).nickname ?? '') || uid
    } catch {
      // Profilo non leggibile: si usa l'uid.
    }
    return uid
  }

  /**
   * Chi si ritrova invitato nella gara senza doverlo chiedere.
   *
   * Sono gli account che hanno gia' un permesso valido con questo pilota, nei
   * due sensi: l'ingegnere che assiste e il compagno che ci ha autorizzati.
   * E' il riuso del mattoncino che esiste gia' (PIP-359) invece di un secondo
   * elenco parallelo da tenere allineato: la squadra si pre-autorizza una
   * volta, e a ogni gara si ritrova dentro da sola.
   *
   * Nessuna scorciatoia sull'accesso: questo semina soltanto gli *invitati*,
   * che e' esattamente cio' che un manager potrebbe scrivere a mano. Chi non
   * ha un permesso resta fuori finche' qualcuno non lo invita.
   */
  async function readTrustedUids(uid: string): Promise<string[]> {
    const trusted = new Set<string>()
    const nowMs = Date.now()
    for (const [field, mine] of [['driverUid', 'engineerUid'], ['engineerUid', 'driverUid']] as const) {
      try {
        const snapshot = await trackedGetDocs(query(
          collection(db, 'pitwallGrants'),
          where(field, '==', uid),
          where('status', '==', 'granted'),
          limit(50)
        ), 'pitwallRoom.trustedUids')
        for (const entry of snapshot.docs) {
          const grant = entry.data() as PitwallGrant
          if (!isPitwallGrantUsable(grant, grant.driverUid, grant.engineerUid, nowMs)) continue
          const other = grant[mine]
          if (other && other !== uid) trusted.add(other)
        }
      } catch {
        // Elenco non leggibile: si apre la stanza senza inviti preseminati.
        // Gli inviti manuali restano sempre possibili.
      }
    }
    return [...trusted]
  }

  async function sync(): Promise<void> {
    const bridge = electronBridge()
    if (!bridge?.pitwallSubmitRemoteOrder || !bridge.pitwallGetLinkStatus) {
      // Browser normale o finestra secondaria: qui non c'e' nessun pilota da
      // annunciare, e ACC non e' raggiungibile.
      unavailableReason.value = 'Il collegamento pilota vive nella finestra principale della suite.'
      stop()
      return
    }

    // Una sola finestra fa il lavoro cloud: senza questo, due finestre
    // aperte annuncerebbero lo stesso pilota e consegnerebbero l'ordine due volte.
    if (!options.jobsEnabled.value) {
      unavailableReason.value = 'Un altra finestra possiede i lavori cloud.'
      stop()
      return
    }

    let status: { trustedSender: boolean, driverUid: string | null } | null = null
    try {
      status = await bridge.pitwallGetLinkStatus()
    } catch {
      status = null
    }

    if (!status?.trustedSender || !status.driverUid) {
      unavailableReason.value = 'Nessun pilota autenticato su questo computer.'
      stop()
      return
    }

    if (handle && driverUid.value === status.driverUid) return

    // Cambio account: si chiude il collegamento precedente prima di aprirne uno
    // nuovo, cosi' la presenza del pilota di prima non resta accesa.
    stop()
    driverUid.value = status.driverUid
    unavailableReason.value = null
    handle = startPitwallDriverLink({
      db,
      driverUid: status.driverUid,
      sessionId: newSessionId(),
      electronApi: bridge,
      // Fotografia reale della vettura per l'ingegnere: equipaggio dalla
      // EntryList e strategia dal Pit MFD. Solo con ACC vivo: dati vecchi non
      // si pubblicano come attuali.
      readCarContext: async () => {
        try {
          const state = await bridge.pitwallGetStrategyState?.()
          if (!state?.live || !state.fresh) return null
          const crew = state.crew?.available
            ? state.crew.drivers.map(member => ({
                driverIndex: member.driverIndex,
                name: `${member.firstName} ${member.lastName}`.trim() || member.shortName,
                current: member.driverIndex === state.crew?.currentDriverIndex,
              }))
            : null
          return {
            car: state.identity?.car ?? null,
            track: state.identity?.track ?? null,
            crew,
            strategy: {
              fuelToAdd: state.car?.fuelToAdd ?? null,
              tyreSet: state.car?.tyreSet ?? null,
              pressures: state.car?.pressures ?? null,
              compound: state.car?.compound ?? null,
            },
          }
        } catch {
          return null
        }
      },
    })

    // La Race Room vive accanto alla presenza uno-a-uno, non al posto suo: il
    // percorso vecchio resta acceso in lettura finche' la stanza non ha
    // superato la QA a piu' account. Gli ordini pero' viaggiano su un solo
    // percorso - la stanza - perche' due canali per lo stesso comando
    // vorrebbero dire deduplica distribuita senza alcun beneficio.
    const uid = status.driverUid
    void (async () => {
      const nickname = await readNickname(uid)
      if (driverUid.value !== uid) return
      roomHandle = startPitwallRoomDriver({
        db,
        uid,
        nickname,
        runtimeSessionId: newSessionId(),
        electronApi: bridge,
        readTrustedUids: () => readTrustedUids(uid),
        readVehicle: async () => {
          try {
            const state = await bridge.pitwallGetStrategyState?.()
            if (!state?.live || !state.fresh) return null
            const vehicle = state.vehicle
            if (!vehicle?.available || !vehicle.fingerprint) return null
            // `driving` lo dice ACC, non un bottone: il pilota non deve
            // gestire niente mentre guida, ed e' il vincolo che ha dato forma
            // a tutta la feature.
            const link = await bridge.pitwallGetLinkStatus?.()
            const crew = state.crew?.available
              ? state.crew.drivers.map(member => ({
                  driverIndex: member.driverIndex,
                  name: `${member.firstName} ${member.lastName}`.trim() || member.shortName,
                  current: member.driverIndex === state.crew?.currentDriverIndex,
                }))
              : null
            return {
              fingerprint: vehicle.fingerprint,
              label: vehicle.label ?? 'Gara in corso',
              track: vehicle.trackName ?? state.identity?.track ?? null,
              raceNumber: vehicle.raceNumber ?? null,
              teamName: vehicle.teamName ?? null,
              driving: link?.driverState === 'driving',
              crew,
              strategy: {
                fuelToAdd: state.car?.fuelToAdd ?? null,
                tyreSet: state.car?.tyreSet ?? null,
                pressures: state.car?.pressures ?? null,
                compound: state.car?.compound ?? null,
              },
            }
          } catch {
            return null
          }
        },
      })
      roomId.value = roomHandle.roomId()
    })()

    active.value = true
  }

  void sync()
  // L'identita' vive nel main: si ricontrolla invece di osservare un secondo
  // stato di autenticazione nel renderer.
  pollTimer = setInterval(() => { void sync() }, 15_000)
  watch(options.jobsEnabled, () => { void sync() })

  onScopeDispose(() => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    stop()
  })

  return {
    active,
    driverUid,
    unavailableReason,
    /** La gara in cui questo PC si trova adesso, se ACC e' in sessione. */
    roomId,
    /** Perche' non c'e' una gara, quando non c'e'. */
    roomUnavailableReason: () => roomHandle?.unavailableReason() ?? null,
    stop,
  }
}
