// ============================================
// Collegamento Pit Wall per il pannello dell'ingegnere.
//
// Tiene lo stato di cio' che serve alla pagina: quali piloti hanno concesso il
// collegamento, chi e' raggiungibile adesso, e com'e' andato l'ultimo ordine.
//
// Non applica nulla: l'autorita' e' il PC del pilota. Qui si invia e si
// osserva, e si dice sempre la verita' su cosa e' successo.
// ============================================

import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { db } from '~/config/firebase'
import { createPitwallRealtimeEngineerService as createPitwallEngineerService } from '~/services/pitwall/pitwallRealtimeEngineerService'
import { closePitwallRealtimeWhenIdle } from '~/config/pitwallRealtime'
import { createPitwallPresenceWatch } from '~/composables/usePitwallPresenceWatch'
import {
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
} from '~/services/pitwall/pitwallLink'

/** Esito per campo dichiarato dal PC del pilota: mai appiattito in un "fatto". */
export interface PitwallFieldOutcome {
  outcome: 'verified' | 'selected' | 'not-verifiable' | null
  requested: unknown
  observed: unknown
  reason: string | null
  /** Da dove viene l'esito: l'occhio sullo schermo, la shared memory, o un tasto alla cieca. */
  via?: 'screen' | 'memory' | 'blind' | null
  /** Non chiesta: ACC l'ha cambiata insieme a un'altra riparazione. */
  dragged?: boolean
}

/** PIP-561: result of one permission action, with a short reason code for diagnostics. */
export interface PitwallActionOutcome {
  ok: boolean
  code: string | null
  /** A request sent again after the 24 h wait had expired. */
  afterCooldown?: boolean
}

export interface PitwallLinkOptions {
  /** Uid dell'ingegnere collegato. Null finche' non e' autenticato. */
  engineerUid: () => string | null
  /** The calling view already presents empty results beside its search field. */
  inlineSearchFeedback?: boolean
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
  // PIP-561: each action returns its own outcome (no shared "last failure" state).
  const codeOf = (result: object) => ('code' in result && typeof result.code === 'string' ? result.code : 'unknown')
  const failed = (code: string): PitwallActionOutcome => ({ ok: false, code })
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

  let serviceUid: string | null = null
  function service() {
    const uid = options.engineerUid()
    if (!uid) return null
    if (!serviceRef.value || serviceUid !== uid) {
      serviceUid = uid
      try { serviceRef.value = createPitwallEngineerService({ db, engineerUid: uid }) }
      catch (error) { rawError.value = (error as Error).message; return null }
    }
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
      const rows = await engineer.listOutgoingLinks()
      if (serviceRef.value !== engineer || !options.engineerUid()) return
      outgoing.value = rows
      if (selectedDriverUid.value && !pilots.value.some(p => p.driverUid === selectedDriverUid.value)) {
        // Il collegamento e' stato revocato mentre la pagina era aperta.
        selectPilot(null)
      }
    } catch (error) {
      if (serviceRef.value !== engineer || !options.engineerUid()) return
      rawError.value = (error as Error)?.message || 'Elenco piloti non disponibile.'
      outgoing.value = []
    } finally {
      loading.value = false
    }
  }

  function selectPilot(driverUid: string | null): void {
    selectedDriverUid.value = driverUid
  }

  /**
   * Chi e' in pista adesso, fra le persone che mi hanno autorizzato.
   *
   * Ascolti, decadimento e scheda nascosta sono una cosa sola e vivono nel
   * loro modulo: qui resta l'elenco su cui scrivono.
   */
  const presence = createPitwallPresenceWatch({ service, outgoing, eventDriven: true })

  // Chi si autorizza adesso non deve aspettare il giro dopo per essere
  // guardato: l'elenco cambia e gli ascolti lo seguono. Si confronta *chi*
  // c'e', non l'oggetto, perche' ogni presenza che arriva riscrive l'elenco.
  watch(
    () => [outgoing.value.filter(link => link.usable).map(link => link.driverUid).join('|'), incoming.value.filter(request => request.status === 'granted').map(request => request.engineerUid).join('|')].join(';'),
    () => presence.sync()
  )

  /**
   * Chiede il collegamento, dicendo cosa si chiede: "solo per oggi" o
   * "sempre". Qualunque rifiuto diventa un messaggio in pagina: un errore di
   * permessi non deve mai propagarsi e far cadere la schermata.
   */
  async function requestLinkOutcome(driverUid: string, scope: PitwallGrantScope = 'once'): Promise<PitwallActionOutcome> {
    const engineer = service()
    if (!engineer) {
      rawError.value = 'Devi essere collegato al tuo account.'
      return failed('auth-required')
    }
    try {
      const result = await engineer.requestLink(driverUid, scope)
      if (!result.ok) {
        rawError.value = result.reason
        return failed(codeOf(result))
      }
      notice.value = result.alreadyGranted
        ? 'Sei gia autorizzato da questo pilota.'
        : (scope === 'always'
            ? 'Richiesta inviata: hai chiesto il collegamento permanente.'
            : 'Richiesta inviata: hai chiesto il collegamento per oggi.')
      if (!stopGrantedWatch) await refreshPilots()
      return { ok: true, code: null, afterCooldown: 'afterCooldown' in result && result.afterCooldown === true }
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Richiesta non riuscita.'
      return failed('unknown')
    }
  }

  /** Ritira una richiesta in attesa (o rinuncia a un collegamento). */
  async function withdrawRequestOutcome(driverUid: string): Promise<PitwallActionOutcome> {
    const engineer = service()
    if (!engineer) { rawError.value = 'Devi essere collegato al tuo account.'; return failed('auth-required') }
    try {
      const result = await engineer.withdraw(driverUid)
      if (!result.ok) {
        rawError.value = result.reason
        return failed(codeOf(result))
      }
      notice.value = 'Richiesta ritirata.'
      if (!stopGrantedWatch) await refreshPilots()
      return { ok: true, code: null }
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Ritiro non riuscito.'
      return failed('unknown')
    }
  }
  const requestLink = async (driverUid: string, scope: PitwallGrantScope = 'once') => (await requestLinkOutcome(driverUid, scope)).ok
  const withdrawRequest = async (driverUid: string) => (await withdrawRequestOutcome(driverUid)).ok

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
      const results = await engineer.searchUsers(searchTerm.value)
      if (serviceRef.value !== engineer || !options.engineerUid()) return
      searchResults.value = results
      if (!options.inlineSearchFeedback && searchTerm.value.trim().length >= 2 && searchResults.value.length === 0) {
        notice.value = 'Nessun utente trovato con questo nome.'
      } else {
        notice.value = null
      }
    } catch (error) {
      if (serviceRef.value !== engineer || !options.engineerUid()) return
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
      const rows = await engineer.listIncomingRequests()
      if (serviceRef.value !== engineer || !options.engineerUid()) return
      incoming.value = rows
    } catch (error) {
      if (serviceRef.value !== engineer || !options.engineerUid()) return
      rawError.value = (error as Error)?.message || 'Richieste non disponibili.'
      incoming.value = []
    }
  }

  /**
   * Il pilota concede o toglie: e' l'unico che puo' deciderlo. Concedendo
   * sceglie la portata: "solo per oggi" scade da solo, "sempre" resta.
   */
  async function decideOutcome(
    requesterUid: string,
    decision: 'granted' | 'revoked',
    scope: PitwallGrantScope = 'always',
    expiresAtMs: number | null = null
  ): Promise<PitwallActionOutcome> {
    const engineer = service()
    if (!engineer) { rawError.value = 'Devi essere collegato al tuo account.'; return failed('auth-required') }
    try {
      const result = await engineer.decideRequest(requesterUid, decision, scope, expiresAtMs)
      if (!result.ok) {
        rawError.value = result.reason
        return failed(codeOf(result))
      }
      notice.value = decision === 'granted'
        ? null
        : 'Collegamento revocato.'
      // L'elenco si aggiorna da solo tramite l'ascolto; si rilegge solo se
      // quell'ascolto non e' attivo, per non pagare due volte la stessa cosa.
      if (pollInbox) await pollInbox(); else if (!stopIncomingWatch) await refreshIncoming()
      return { ok: true, code: null }
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Decisione non riuscita.'
      return failed('unknown')
    }
  }

  /** Autorizza qualcuno in anticipo, senza attendere che chieda. */
  async function preAuthoriseOutcome(
    uid: string,
    scope: PitwallGrantScope = 'always',
    expiresAtMs: number | null = null
  ): Promise<PitwallActionOutcome> {
    const engineer = service()
    if (!engineer) { rawError.value = 'Devi essere collegato al tuo account.'; return failed('auth-required') }
    try {
      const result = await engineer.preAuthorise(uid, scope, expiresAtMs)
      if (!result.ok) {
        rawError.value = result.reason
        return failed(codeOf(result))
      }
      notice.value = null
      if (pollInbox) await pollInbox(); else if (!stopIncomingWatch) await refreshIncoming()
      return { ok: true, code: null }
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Pre-autorizzazione non riuscita.'
      return failed('unknown')
    }
  }
  const decide = async (requesterUid: string, decision: 'granted' | 'revoked', scope: PitwallGrantScope = 'always', expiresAtMs: number | null = null) =>
    (await decideOutcome(requesterUid, decision, scope, expiresAtMs)).ok
  const preAuthorise = async (uid: string, scope: PitwallGrantScope = 'always', expiresAtMs: number | null = null) =>
    (await preAuthoriseOutcome(uid, scope, expiresAtMs)).ok

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
      if (pollInbox) await pollInbox(); else if (!stopIncomingWatch) await refreshIncoming()
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

    if (stopIncomingWatch) return
    stopIncomingWatch = engineer.watchIncomingRequests(
      (requests) => { if (serviceRef.value === engineer && options.engineerUid()) incoming.value = requests },
      (error) => { rawError.value = error?.message || 'Richieste non disponibili.' }
    )

    stopGrantedWatch = engineer.watchOutgoingLinks(
      (links) => {
        if (serviceRef.value !== engineer || !options.engineerUid()) return
        const previous = new Map(outgoing.value.map(link => [link.driverUid, link]))
        outgoing.value = links.map(link => {
          const cached = previous.get(link.driverUid)
          return cached && link.usable ? { ...link, session: cached.session, reachable: cached.reachable } : link
        })
        if (selectedDriverUid.value && !pilots.value.some(link => link.driverUid === selectedDriverUid.value)) selectPilot(null)
      },
      (error) => { rawError.value = error?.message || 'Elenco piloti non disponibile.' }
    )

    // Chi e' in pista si vede solo se qualcuno lo guarda: sono questi ascolti
    // a far comparire e sparire da sole le righe di "In pista".
    presence.start()
  }

  /**
   * Campanella fuori dal Pitwall: solo richieste in arrivo, senza profili.
   * PIP-660: una lettura ogni ~3 minuti (e quando la finestra torna in primo piano) invece di un ascolto
   * continuo, poi la connessione si chiude se nient'altro la usa: il piano gratuito ne ammette 100 insieme.
   */
  let pollInbox: (() => Promise<void>) | null = null
  function watchInbox(): void {
    const engineer = service()
    if (!engineer || stopIncomingWatch) return
    let cancelled = false, timer: ReturnType<typeof setTimeout> | null = null
    const poll = async () => {
      if (timer) { clearTimeout(timer); timer = null }
      try {
        const requests = await engineer.listPendingRequests()
        if (!cancelled && serviceRef.value === engineer && options.engineerUid()) incoming.value = requests
      } catch (error) { if (!cancelled) rawError.value = (error as Error)?.message || 'Richieste non disponibili.' }
      // A little jitter so many clients do not reconnect in the same second.
      if (!cancelled) { closePitwallRealtimeWhenIdle(); timer = setTimeout(() => { void poll() }, 180_000 + Math.floor(Math.random() * 30_000)) }
    }
    const onFocus = () => { void poll() }
    if (typeof window !== 'undefined') window.addEventListener('focus', onFocus)
    void poll()
    // Codex: a decision taken from the bell rereads at once (there is no listener to update it).
    pollInbox = poll
    stopIncomingWatch = () => { cancelled = true; pollInbox = null; if (timer) clearTimeout(timer); if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus) }
  }

  function stop(): void {
    stopOrderWatch?.()
    stopIncomingWatch?.()
    stopGrantedWatch?.()
    stopOrderWatch = null
    stopIncomingWatch = null
    stopGrantedWatch = null
    presence.stop()
    serviceRef.value = null
    serviceUid = null
    outgoing.value = []
    incoming.value = []
    searchResults.value = []
    searchTerm.value = ''
    selectedDriverUid.value = null
  }

  onScopeDispose(stop)

  return {
    readFriendView: async (personId: string) => {
      const engineer = service()
      if (!engineer) throw new Error('Account non disponibile.')
      return engineer.readFriendView(personId)
    },
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
    watchInbox,
    decide,
    preAuthorise,
    setExpiry,
    requestLinkOutcome,
    withdrawRequestOutcome,
    decideOutcome,
    preAuthoriseOutcome,
  }
}
