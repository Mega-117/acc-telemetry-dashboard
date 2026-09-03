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
  type PitwallOutgoingLink,
} from '~/services/pitwall/pitwallEngineerService'
import {
  describePitwallLinkError,
  describePitwallOrderStatus,
  isPitwallOrderSettled,
  type PitwallGrantScope,
  type PitwallOrderStatus,
  type PitwallSession,
} from '~/services/pitwall/pitwallLink'

/** Esito per campo dichiarato dal PC del pilota: mai appiattito in un "fatto". */
export interface PitwallFieldOutcome {
  outcome: 'verified' | 'selected' | 'not-verifiable' | null
  requested: unknown
  observed: unknown
  reason: string | null
}

export interface PitwallLinkOptions {
  /** Uid dell'ingegnere collegato. Null finche' non e' autenticato. */
  engineerUid: () => string | null
}

export function usePitwallLink(options: PitwallLinkOptions) {
  /**
   * Tutti i collegamenti in uscita, in una sola lettura: pronti, in attesa e
   * passati. Le viste della pagina sono filtri di questa lista.
   */
  const outgoing = ref<PitwallOutgoingLink[]>([])
  const selectedDriverUid = ref<string | null>(null)
  const loading = ref(false)
  const sending = ref(false)
  const rawError = ref<string | null>(null)
  // Cio' che legge l'ingegnere e' la frase tradotta, non il gergo del servizio.
  const lastError = computed(() => describePitwallLinkError(rawError.value))

  const orderId = ref<string | null>(null)
  const orderStatus = ref<PitwallOrderStatus | null>(null)
  const orderReason = ref<string | null>(null)
  /** Esito per campo dell'ultimo ordine: verified, selected e not-verifiable. */
  const orderFields = ref<Record<string, PitwallFieldOutcome>>({})
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
  let stopIncomingWatch: (() => void) | null = null
  let stopGrantedWatch: (() => void) | null = null

  function service() {
    const uid = options.engineerUid()
    if (!uid) return null
    if (!serviceRef.value) serviceRef.value = createPitwallEngineerService({ db, engineerUid: uid })
    return serviceRef.value
  }

  /** I piloti a cui posso collegarmi adesso: "sempre" in cima, poi "oggi". */
  const pilots = computed(() => outgoing.value.filter(link => link.usable))
  /** Richieste inviate e ancora in attesa dell'autorizzazione del pilota. */
  const pendingOutgoing = computed(() => outgoing.value.filter(link => !link.usable && link.status === 'pending'))
  /** Collegamenti passati: revocati o scaduti, da cui si puo' richiedere. */
  const pastOutgoing = computed(() => outgoing.value.filter(link => !link.usable && link.status !== 'pending'))

  const selectedPilot = computed(
    () => pilots.value.find(pilot => pilot.driverUid === selectedDriverUid.value) ?? null
  )
  /** Quante richieste aspettano una risposta: e' il numero sul campanello. */
  const pendingIncoming = computed(() => incoming.value.filter(request => request.status === 'pending'))
  const grantedIncoming = computed(() => incoming.value.filter(request => request.status === 'granted'))
  const canSend = computed(() => Boolean(selectedPilot.value?.reachable) && !sending.value)
  const orderProgress = computed(() => describePitwallOrderStatus(orderStatus.value))

  async function refreshPilots(): Promise<void> {
    const engineer = service()
    if (!engineer) {
      outgoing.value = []
      return
    }
    loading.value = true
    rawError.value = null
    try {
      outgoing.value = await engineer.listOutgoingLinks()
      if (selectedDriverUid.value && !pilots.value.some(p => p.driverUid === selectedDriverUid.value)) {
        // Il collegamento e' stato revocato mentre la pagina era aperta.
        selectPilot(null)
      }
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Elenco piloti non disponibile.'
      outgoing.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Sceglie il pilota da assistere e ne rilegge subito la presenza, poi la
   * tiene aggiornata al passo del suo battito (30 s).
   *
   * La presenza si rilegge invece di ascoltarla: cambia lentamente e un
   * listener costerebbe di piu' senza dire nulla di piu'. Due letture al
   * minuto, contate dal tracker, solo mentre un pilota e' selezionato.
   */
  let presenceTimer: ReturnType<typeof setInterval> | null = null

  function refreshSelectedPresence(): void {
    const driverUid = selectedDriverUid.value
    const engineer = service()
    if (!driverUid || !engineer) return
    void engineer.readPilotPresence(driverUid).then(({ session, reachable }) => {
      outgoing.value = outgoing.value.map(link => (
        link.driverUid === driverUid ? { ...link, session, reachable } : link
      ))
    })
  }

  function selectPilot(driverUid: string | null): void {
    selectedDriverUid.value = driverUid
    if (presenceTimer) clearInterval(presenceTimer)
    presenceTimer = null
    if (!driverUid) return
    refreshSelectedPresence()
    presenceTimer = setInterval(refreshSelectedPresence, 30_000)
  }

  /**
   * Chi e' in pista adesso, fra le persone che mi hanno autorizzato.
   *
   * La presenza di un pilota vive in un documento suo, che si rilegge al passo
   * del suo battito. Prima si rileggeva solo quella del pilota selezionato, e
   * l'elenco "chi posso assistere adesso" non poteva esistere: si sapeva chi
   * era vivo soltanto dopo essere entrati da lui. Si leggono i soli
   * collegamenti utilizzabili, e non piu' di dodici: oltre non sarebbe
   * comunque un elenco che si guarda.
   */
  const PRESENCE_POLL_MS = 30_000
  const MAX_WATCHED_PILOTS = 12
  let pilotsPresenceTimer: ReturnType<typeof setInterval> | null = null

  async function refreshPilotsPresence(): Promise<void> {
    const engineer = service()
    if (!engineer) return
    const watched = outgoing.value.filter(link => link.usable).slice(0, MAX_WATCHED_PILOTS)
    if (!watched.length) return
    const seen = new Map<string, { session: PitwallSession | null, reachable: boolean }>()
    await Promise.all(watched.map(async (link) => {
      try {
        seen.set(link.driverUid, await engineer.readPilotPresence(link.driverUid))
      } catch {
        // Una presenza non letta lascia l'ultima nota: sparirebbe da sola al
        // battito successivo, e far lampeggiare l'elenco sarebbe peggio.
      }
    }))
    if (!seen.size) return
    outgoing.value = outgoing.value.map((link) => {
      const fresh = seen.get(link.driverUid)
      return fresh ? { ...link, session: fresh.session, reachable: fresh.reachable } : link
    })
  }

  function watchPilotsPresence(): void {
    if (pilotsPresenceTimer) clearInterval(pilotsPresenceTimer)
    void refreshPilotsPresence()
    pilotsPresenceTimer = setInterval(() => { void refreshPilotsPresence() }, PRESENCE_POLL_MS)
  }

  /**
   * Chiede il collegamento, dicendo cosa si chiede: "solo per oggi" o
   * "sempre". Qualunque rifiuto diventa un messaggio in pagina: un errore di
   * permessi non deve mai propagarsi e far cadere la schermata.
   */
  async function requestLink(driverUid: string, scope: PitwallGrantScope = 'once'): Promise<boolean> {
    const engineer = service()
    if (!engineer) {
      rawError.value = 'Devi essere collegato al tuo account.'
      return false
    }
    try {
      const result = await engineer.requestLink(driverUid, scope)
      if (!result.ok) {
        rawError.value = result.reason
        return false
      }
      notice.value = result.alreadyGranted
        ? 'Sei gia autorizzato da questo pilota.'
        : (scope === 'always'
            ? 'Richiesta inviata: hai chiesto il collegamento permanente.'
            : 'Richiesta inviata: hai chiesto il collegamento per oggi.')
      await refreshPilots()
      return true
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Richiesta non riuscita.'
      return false
    }
  }

  /** Ritira una richiesta in attesa (o rinuncia a un collegamento). */
  async function withdrawRequest(driverUid: string): Promise<void> {
    const engineer = service()
    if (!engineer) return
    try {
      const result = await engineer.withdraw(driverUid)
      if (!result.ok) {
        rawError.value = result.reason
        return
      }
      notice.value = 'Richiesta ritirata.'
      await refreshPilots()
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Ritiro non riuscito.'
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
    orderFields.value = {}
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
        const result = document.result as {
          reason?: string | null
          fields?: Record<string, PitwallFieldOutcome>
        } | undefined
        orderReason.value = result?.reason ?? null
        orderFields.value = result?.fields ?? {}
        if (isPitwallOrderSettled(document.status)) {
          stopOrderWatch?.()
          stopOrderWatch = null
          // L'ordine e' concluso: la macchina e' cambiata, si rilegge subito
          // invece di aspettare il prossimo battito.
          refreshSelectedPresence()
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

  /**
   * Il pilota concede o toglie: e' l'unico che puo' deciderlo. Concedendo
   * sceglie la portata: "solo per oggi" scade da solo, "sempre" resta.
   */
  async function decide(
    requesterUid: string,
    decision: 'granted' | 'revoked',
    scope: PitwallGrantScope = 'always',
    expiresAtMs: number | null = null
  ): Promise<void> {
    const engineer = service()
    if (!engineer) return
    try {
      const result = await engineer.decideRequest(requesterUid, decision, scope, expiresAtMs)
      if (!result.ok) {
        rawError.value = result.reason
        return
      }
      notice.value = decision === 'granted'
        ? (scope === 'once' ? 'Collegamento autorizzato solo per oggi.' : 'Collegamento autorizzato.')
        : 'Collegamento revocato.'
      // L'elenco si aggiorna da solo tramite l'ascolto; si rilegge solo se
      // quell'ascolto non e' attivo, per non pagare due volte la stessa cosa.
      if (!stopIncomingWatch) await refreshIncoming()
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Decisione non riuscita.'
    }
  }

  /** Autorizza qualcuno in anticipo, senza attendere che chieda. */
  async function preAuthorise(
    uid: string,
    scope: PitwallGrantScope = 'always',
    expiresAtMs: number | null = null
  ): Promise<void> {
    const engineer = service()
    if (!engineer) return
    try {
      const result = await engineer.preAuthorise(uid, scope, expiresAtMs)
      if (!result.ok) {
        rawError.value = result.reason
        return
      }
      notice.value = scope === 'once'
        ? 'Autorizzato per oggi: potra collegarsi senza chiedere fino a stasera.'
        : 'Utente pre-autorizzato: potra collegarsi senza chiedere.'
      if (!stopIncomingWatch) await refreshIncoming()
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Pre-autorizzazione non riuscita.'
    }
  }

  /** Cambia l'orario di un "solo per oggi" gia' concesso: solo il pilota puo'. */
  async function setExpiry(uid: string, expiresAtMs: number): Promise<void> {
    const engineer = service()
    if (!engineer) return
    try {
      const result = await engineer.updateGrantExpiry(uid, expiresAtMs)
      if (!result.ok) {
        rawError.value = result.reason
        return
      }
      notice.value = 'Scadenza aggiornata.'
      if (!stopIncomingWatch) await refreshIncoming()
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Scadenza non aggiornata.'
    }
  }

  /**
   * Accende gli ascolti che tengono viva la pagina.
   *
   * Senza, l'unico modo di accorgersi di una richiesta o di essere stati
   * autorizzati era ricaricare: la cosa piu' facile da non fare proprio quando
   * conta. Da qui in poi arriva tutto da solo.
   */
  function watchLive(): void {
    const engineer = service()
    if (!engineer) return

    stopIncomingWatch?.()
    stopIncomingWatch = engineer.watchIncomingRequests(
      (requests) => { incoming.value = requests },
      (error) => { rawError.value = error?.message || 'Richieste non disponibili.' }
    )

    stopGrantedWatch?.()
    let knownPilots = ''
    stopGrantedWatch = engineer.watchGrantedPilots(
      (driverUids) => {
        // Si ricarica l'elenco solo se e' davvero cambiato *chi* c'e': un
        // aggiornamento qualsiasi non deve far ripartire nome e presenza.
        const signature = [...driverUids].sort().join('|')
        if (signature === knownPilots) return
        knownPilots = signature
        void refreshPilots()
      },
      (error) => { rawError.value = error?.message || 'Elenco piloti non disponibile.' }
    )

    // Chi e' in pista si vede solo se qualcuno lo guarda: e' questo battito a
    // far comparire e sparire da sole le righe di "In pista".
    watchPilotsPresence()
  }

  function stop(): void {
    stopOrderWatch?.()
    stopIncomingWatch?.()
    stopGrantedWatch?.()
    stopOrderWatch = null
    stopIncomingWatch = null
    stopGrantedWatch = null
    if (presenceTimer) clearInterval(presenceTimer)
    presenceTimer = null
    if (pilotsPresenceTimer) clearInterval(pilotsPresenceTimer)
    pilotsPresenceTimer = null
  }

  onScopeDispose(stop)

  return {
    outgoing,
    pilots,
    pendingOutgoing,
    pastOutgoing,
    withdrawRequest,
    selectedDriverUid,
    selectedPilot,
    loading,
    sending,
    canSend,
    lastError,
    orderId,
    orderStatus,
    orderReason,
    orderFields,
    orderProgress,
    refreshPilots,
    selectPilot,
    requestLink,
    sendPlan,
    stop,
    searchTerm,
    searchResults,
    incoming,
    pendingIncoming,
    grantedIncoming,
    notice,
    search,
    refreshIncoming,
    watchLive,
    decide,
    preAuthorise,
    setExpiry,
  }
}
