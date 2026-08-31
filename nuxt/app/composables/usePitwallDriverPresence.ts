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
import { db } from '~/config/firebase'
import {
  startPitwallDriverLink,
  type PitwallDriverElectronApi,
  type PitwallDriverLinkHandle,
} from '~/services/pitwall/pitwallDriverLinkService'

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
  let handle: PitwallDriverLinkHandle | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function stop(): void {
    if (!handle) return
    void handle.goOffline()
    handle.stop()
    handle = null
    active.value = false
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

  return { active, driverUid, unavailableReason, stop }
}
