// ============================================
// Collegamento Pit Wall per il pannello dell'ingegnere.
//
// Tiene lo stato di cio' che serve alla pagina: quali piloti hanno concesso il
// collegamento, chi e' raggiungibile adesso, e com'e' andato l'ultimo ordine.
//
// Non applica nulla: l'autorita' e' il PC del pilota. Qui si invia e si
// osserva, e si dice sempre la verita' su cosa e' successo.
// ============================================

import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { db } from '~/config/firebase'
import {
  createPitwallEngineerService,
  type PitwallDirectoryEntry,
  type PitwallIncomingRequest,
  type PitwallLinkedPilot,
} from '~/services/pitwall/pitwallEngineerService'
import {
  describePitwallLinkError,
  describePitwallOrderStatus,
  isPitwallOrderSettled,
  type PitwallOrderStatus,
} from '~/services/pitwall/pitwallLink'

export interface PitwallLinkOptions {
  /** Uid dell'ingegnere collegato. Null finche' non e' autenticato. */
  engineerUid: () => string | null
}

export function usePitwallLink(options: PitwallLinkOptions) {
  const pilots = ref<PitwallLinkedPilot[]>([])
  const selectedDriverUid = ref<string | null>(null)
  const loading = ref(false)
  const sending = ref(false)
  const rawError = ref<string | null>(null)
  // Cio' che legge l'ingegnere e' la frase tradotta, non il gergo del servizio.
  const lastError = computed(() => describePitwallLinkError(rawError.value))

  const orderId = ref<string | null>(null)
  const orderStatus = ref<PitwallOrderStatus | null>(null)
  const orderReason = ref<string | null>(null)
  /**
   * Numero d'ordine crescente, ricavato dal tempo.
   *
   * Il PC del pilota scarta un ordine con revisione non successiva all'ultima
   * vista: serve a non tornare indietro nel tempo se un messaggio arriva in
   * ritardo. Un contatore che riparte da zero a ogni ricarica della pagina
   * farebbe sembrare vecchio il primo invio successivo, e verrebbe scartato.
   * I secondi dall'epoca crescono sempre, anche fra sessioni e dispositivi.
   */
  function nextRevision(): number {
    return Math.floor(Date.now() / 1000)
  }

  // Le due facce del collegamento vivono nella stessa pagina: chi assisto, e
  // chi ha chiesto di assistere me.
  const searchTerm = ref('')
  const searchResults = ref<PitwallDirectoryEntry[]>([])
  const incoming = ref<PitwallIncomingRequest[]>([])
  const notice = ref<string | null>(null)

  const serviceRef = shallowRef<ReturnType<typeof createPitwallEngineerService> | null>(null)
  let stopOrderWatch: (() => void) | null = null

  function service() {
    const uid = options.engineerUid()
    if (!uid) return null
    if (!serviceRef.value) serviceRef.value = createPitwallEngineerService({ db, engineerUid: uid })
    return serviceRef.value
  }

  const selectedPilot = computed(
    () => pilots.value.find(pilot => pilot.driverUid === selectedDriverUid.value) ?? null
  )
  const canSend = computed(() => Boolean(selectedPilot.value?.reachable) && !sending.value)
  const orderProgress = computed(() => describePitwallOrderStatus(orderStatus.value))

  async function refreshPilots(): Promise<void> {
    const engineer = service()
    if (!engineer) {
      pilots.value = []
      return
    }
    loading.value = true
    rawError.value = null
    try {
      pilots.value = await engineer.listLinkedPilots()
      if (selectedDriverUid.value && !pilots.value.some(p => p.driverUid === selectedDriverUid.value)) {
        // Il collegamento e' stato revocato mentre la pagina era aperta.
        selectPilot(null)
      }
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Elenco piloti non disponibile.'
      pilots.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Sceglie il pilota da assistere e ne rilegge subito la presenza.
   *
   * La presenza si rilegge invece di ascoltarla: cambia lentamente e un
   * listener costerebbe di piu' senza dire nulla di piu'.
   */
  function selectPilot(driverUid: string | null): void {
    selectedDriverUid.value = driverUid
    if (!driverUid) return
    const engineer = service()
    if (!engineer) return
    void engineer.readPilotPresence(driverUid).then(({ session, reachable }) => {
      pilots.value = pilots.value.map(pilot => (
        pilot.driverUid === driverUid ? { ...pilot, session, reachable } : pilot
      ))
    })
  }

  /**
   * Chiede il collegamento. Qualunque rifiuto diventa un messaggio in pagina:
   * un errore di permessi non deve mai propagarsi e far cadere la schermata.
   */
  async function requestLink(driverUid: string, note: string | null = null): Promise<boolean> {
    const engineer = service()
    if (!engineer) {
      rawError.value = 'Devi essere collegato al tuo account.'
      return false
    }
    try {
      const result = await engineer.requestLink(driverUid, note)
      if (!result.ok) {
        rawError.value = result.reason
        return false
      }
      notice.value = result.alreadyGranted
        ? 'Sei gia autorizzato da questo pilota.'
        : 'Richiesta inviata: ora tocca al pilota autorizzarti.'
      await refreshPilots()
      return true
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Richiesta non riuscita.'
      return false
    }
  }

  /**
   * Invia la strategia al pilota selezionato e segue l'ordine fino all'esito.
   * Non dichiara mai riuscito cio' che non e' stato confermato dal suo PC.
   */
  async function sendPlan(plan: Record<string, unknown>): Promise<boolean> {
    const engineer = service()
    const driverUid = selectedDriverUid.value
    if (!engineer || !driverUid) {
      rawError.value = 'Nessun pilota selezionato.'
      return false
    }

    sending.value = true
    rawError.value = null
    orderReason.value = null
    try {
      const sent = await engineer.sendOrder({ driverUid, plan, revision: nextRevision() })
        .catch((error: unknown) => ({ ok: false as const, reason: (error as Error)?.message || 'Invio non riuscito.' }))
      if (!sent.ok) {
        rawError.value = sent.reason
        orderStatus.value = 'rejected'
        return false
      }

      orderId.value = sent.orderId
      orderStatus.value = 'pending'
      stopOrderWatch?.()
      stopOrderWatch = engineer.watchOrder(driverUid, sent.orderId, (document) => {
        if (!document) return
        orderStatus.value = document.status
        const result = document.result as { reason?: string | null } | undefined
        orderReason.value = result?.reason ?? null
        if (isPitwallOrderSettled(document.status)) {
          stopOrderWatch?.()
          stopOrderWatch = null
        }
      })
      return true
    } finally {
      sending.value = false
    }
  }

  /** Cerca un utente da invitare. Sotto due lettere non si cerca nulla. */
  async function search(): Promise<void> {
    const engineer = service()
    if (!engineer) return
    try {
      searchResults.value = await engineer.searchUsers(searchTerm.value)
      if (searchTerm.value.trim().length >= 2 && searchResults.value.length === 0) {
        notice.value = 'Nessun utente trovato con questo nome.'
      } else {
        notice.value = null
      }
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Ricerca non disponibile.'
      searchResults.value = []
    }
  }

  /** Chi ha chiesto di assistermi, e chi ho gia' autorizzato. */
  async function refreshIncoming(): Promise<void> {
    const engineer = service()
    if (!engineer) {
      incoming.value = []
      return
    }
    try {
      incoming.value = await engineer.listIncomingRequests()
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Richieste non disponibili.'
      incoming.value = []
    }
  }

  /** Il pilota concede o toglie: e' l'unico che puo' deciderlo. */
  async function decide(requesterUid: string, decision: 'granted' | 'revoked'): Promise<void> {
    const engineer = service()
    if (!engineer) return
    try {
      const result = await engineer.decideRequest(requesterUid, decision)
      if (!result.ok) {
        rawError.value = result.reason
        return
      }
      notice.value = decision === 'granted' ? 'Collegamento autorizzato.' : 'Collegamento revocato.'
      await refreshIncoming()
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Decisione non riuscita.'
    }
  }

  /** Autorizza qualcuno in anticipo, senza attendere che chieda. */
  async function preAuthorise(uid: string): Promise<void> {
    const engineer = service()
    if (!engineer) return
    try {
      const result = await engineer.preAuthorise(uid)
      if (!result.ok) {
        rawError.value = result.reason
        return
      }
      notice.value = 'Utente pre-autorizzato: potra collegarsi senza chiedere.'
      await refreshIncoming()
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Pre-autorizzazione non riuscita.'
    }
  }

  function stop(): void {
    stopOrderWatch?.()
    stopOrderWatch = null
  }

  onScopeDispose(stop)

  return {
    pilots,
    selectedDriverUid,
    selectedPilot,
    loading,
    sending,
    canSend,
    lastError,
    orderId,
    orderStatus,
    orderReason,
    orderProgress,
    refreshPilots,
    selectPilot,
    requestLink,
    sendPlan,
    stop,
    searchTerm,
    searchResults,
    incoming,
    notice,
    search,
    refreshIncoming,
    decide,
    preAuthorise,
  }
}
