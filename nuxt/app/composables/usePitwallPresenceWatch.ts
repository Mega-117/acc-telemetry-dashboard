// ============================================
// Chi e' in pista adesso: gli ascolti, il decadimento, la scheda nascosta.
//
// Una cosa sola con tre facce, e per questo sta in un file suo: aprire un
// ascolto per ogni persona da guardare, spegnere una riga quando il suo PC
// smette di farsi sentire, e non guardare niente mentre nessuno guarda.
//
// Perche' si ascolta invece di rileggere, contro la decisione del 2026-08-30
// che diceva il contrario: il polling costava dodici letture ogni trenta
// secondi - millequattrocento l'ora - anche a scheda nascosta e anche per chi
// era spento da giorni, perche' rileggeva tutti a prescindere. L'ascolto costa
// una lettura per cambiamento vero: quanto il polling per chi guida, quasi
// niente per gli altri. E chi entra in pista compare subito, non al giro dopo.
// ============================================

import type { Ref } from 'vue'
import { isPitwallSessionFresh, type PitwallSession } from '~/services/pitwall/pitwallLink'
import type { PitwallOutgoingLink } from '~/services/pitwall/pitwallEngineerService'

/** Oltre questo numero non sarebbe comunque un elenco che si guarda. */
export const PITWALL_MAX_WATCHED_PILOTS = 12

/**
 * Ogni quanto si ricontrolla se una presenza e' invecchiata.
 *
 * Cinque secondi non sono cinque letture: e' un confronto di orologi in
 * memoria. Serve perche' un PC che muore non manda nessun evento, e senza
 * l'ultima presenza ricevuta resterebbe "in pista" per sempre.
 */
export const PITWALL_PRESENCE_DECAY_TICK_MS = 5_000

interface PresenceService {
  watchPilotPresence: (
    driverUid: string,
    onChange: (state: { session: PitwallSession | null, reachable: boolean }) => void,
    onError?: (error: Error) => void
  ) => () => void
}

export interface PitwallPresenceWatchOptions {
  service: () => PresenceService | null
  outgoing: Ref<PitwallOutgoingLink[]>
  maxWatched?: number
  decayTickMs?: number
}

export function createPitwallPresenceWatch(options: PitwallPresenceWatchOptions) {
  const maxWatched = options.maxWatched ?? PITWALL_MAX_WATCHED_PILOTS
  const decayTickMs = options.decayTickMs ?? PITWALL_PRESENCE_DECAY_TICK_MS
  /** Un ascolto per pilota, chiuso per nome quando quel pilota esce dall'elenco. */
  const watches = new Map<string, () => void>()
  let decayTimer: ReturnType<typeof setInterval> | null = null
  let removeVisibility: (() => void) | null = null
  /** Gli ascolti sono accesi: distingue "nascosto" da "fermato". */
  let live = false

  function apply(driverUid: string, state: { session: PitwallSession | null, reachable: boolean }): void {
    options.outgoing.value = options.outgoing.value.map(link => (
      link.driverUid === driverUid ? { ...link, session: state.session, reachable: state.reachable } : link
    ))
  }

  /**
   * Tiene gli ascolti allineati a chi c'e' davvero da guardare: attacca a chi
   * manca, stacca da chi non serve piu'. Un permesso revocato non deve
   * lasciarsi dietro un ascolto vivo, che continuerebbe a costare e a scrivere
   * in un elenco dove quella persona non c'e' piu'.
   */
  function sync(): void {
    const service = options.service()
    const watched = service
      ? options.outgoing.value.filter(link => link.usable).slice(0, maxWatched).map(link => link.driverUid)
      : []
    const wanted = new Set(watched)
    for (const [driverUid, stop] of watches) {
      if (wanted.has(driverUid)) continue
      stop()
      watches.delete(driverUid)
    }
    if (!service) return
    for (const driverUid of watched) {
      if (watches.has(driverUid)) continue
      watches.set(driverUid, service.watchPilotPresence(
        driverUid,
        state => apply(driverUid, state),
        // Una presenza che non arriva lascia l'ultima nota: invecchia da sola
        // entro i novanta secondi, e far lampeggiare l'elenco sarebbe peggio.
        () => {}
      ))
    }
  }

  function detachAll(): void {
    for (const stop of watches.values()) stop()
    watches.clear()
  }

  /**
   * Chi ha smesso si spegne da solo, anche senza notizie: e' un ricalcolo
   * locale sull'orologio, senza nessuna lettura. Fa sparire la riga al maturare
   * dei novanta secondi invece che al giro di lettura successivo, che prima
   * poteva volerci fino a due minuti.
   */
  function decay(): void {
    const nowMs = Date.now()
    let changed = false
    const next = options.outgoing.value.map((link) => {
      if (!link.reachable || isPitwallSessionFresh(link.session, nowMs)) return link
      changed = true
      return { ...link, reachable: false }
    })
    if (changed) options.outgoing.value = next
  }

  function startDecay(): void {
    if (decayTimer) return
    decayTimer = setInterval(decay, decayTickMs)
  }

  function stopDecay(): void {
    if (decayTimer) clearInterval(decayTimer)
    decayTimer = null
  }

  /**
   * A scheda nascosta si stacca, al rientro si riattacca.
   *
   * Prima non esisteva nessuna gestione della visibilita' in tutto il frontend:
   * le letture giravano identiche mentre si guardava un'altra scheda, per una
   * schermata che nessuno stava leggendo. Al rientro la prima consegna
   * dell'ascolto porta lo stato di adesso, quindi tornare in focus e'
   * anche l'aggiornamento immediato.
   */
  function installVisibility(): void {
    if (removeVisibility || typeof document === 'undefined') return
    const onVisibility = () => {
      if (!live) return
      if (document.visibilityState === 'hidden') {
        detachAll()
        stopDecay()
        return
      }
      sync()
      startDecay()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)
    removeVisibility = () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }

  return {
    /** Accende gli ascolti su chi c'e' adesso. */
    start(): void {
      live = true
      sync()
      startDecay()
      installVisibility()
    },
    /** Rimette in pari gli ascolti quando cambia *chi* c'e' da guardare. */
    sync(): void {
      if (live) sync()
    },
    stop(): void {
      live = false
      detachAll()
      stopDecay()
      removeVisibility?.()
      removeVisibility = null
    },
  }
}
