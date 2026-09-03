// @vitest-environment jsdom
//
// Chi e' in pista adesso: quando compare, quando sparisce, e quanto costa.
//
// La decisione del 2026-08-30 diceva "la presenza si rilegge, non si ascolta".
// I numeri l'hanno fatta cambiare idea: il polling costava dodici letture ogni
// trenta secondi - millequattrocento l'ora - anche a scheda nascosta e anche
// per chi era spento da giorni, perche' rileggeva tutti a prescindere. Questi
// test presidiano il comportamento *e* il costo, non solo il risultato.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  /** Ascolti aperti sulla presenza, per uid. */
  watches: new Map<string, (state: unknown) => void>(),
  attached: [] as string[],
  detached: [] as string[],
  /** Letture puntuali: qui devono restare zero. */
  reads: [] as string[],
  outgoing: [] as unknown[],
  incoming: [] as unknown[],
  calls: [] as unknown[][],
  refuse: false,
  orderWatch: null as ((doc: unknown) => void) | null,
}))

vi.mock('~/config/firebase', () => ({ db: {} }))

vi.mock('~/services/pitwall/pitwallEngineerService', () => ({
  createPitwallEngineerService: () => ({
    listOutgoingLinks: async () => mocks.outgoing,
    listIncomingRequests: async () => mocks.incoming,
    requestLink: async (...args: unknown[]) => {
      mocks.calls.push(['requestLink', ...args])
      return mocks.refuse ? { ok: false as const, reason: 'permission-denied' } : { ok: true as const }
    },
    withdraw: async (...args: unknown[]) => {
      mocks.calls.push(['withdraw', ...args])
      return { ok: true as const }
    },
    preAuthorise: async (...args: unknown[]) => {
      mocks.calls.push(['preAuthorise', ...args])
      return { ok: true as const }
    },
    decideRequest: async (...args: unknown[]) => {
      mocks.calls.push(['decideRequest', ...args])
      return { ok: true as const }
    },
    updateGrantExpiry: async (...args: unknown[]) => {
      mocks.calls.push(['updateGrantExpiry', ...args])
      return { ok: true as const }
    },
    searchUsers: async () => [],
    readPilotPresence: async (driverUid: string) => {
      mocks.reads.push(driverUid)
      return { session: null, reachable: false }
    },
    watchPilotPresence: (driverUid: string, onChange: (state: unknown) => void) => {
      mocks.attached.push(driverUid)
      mocks.watches.set(driverUid, onChange)
      return () => {
        mocks.detached.push(driverUid)
        mocks.watches.delete(driverUid)
      }
    },
    sendOrder: async (...args: unknown[]) => {
      mocks.calls.push(['sendOrder', ...args])
      return mocks.refuse
        ? { ok: false as const, reason: 'Un altro ordine e gia in applicazione.' }
        : { ok: true as const, orderId: 'ordine-1' }
    },
    watchIncomingRequests: () => () => {},
    watchGrantedPilots: () => () => {},
    watchOrder: (_driverUid: string, _orderId: string, onChange: (doc: unknown) => void) => {
      mocks.orderWatch = onChange
      return () => { mocks.orderWatch = null }
    },
  }),
}))

import { usePitwallLink } from '~/composables/usePitwallLink'

const NOW = Date.parse('2026-09-03T15:00:00.000Z')

function outgoing(driverUid: string, usable = true) {
  return { driverUid, nickname: driverUid, status: 'granted', usable, reachable: false, session: null, grant: null }
}

function sessionAt(ms: number) {
  return { schemaVersion: 1, driverUid: 'x', sessionId: 's', online: true, updatedAt: new Date(ms).toISOString() }
}

function start() {
  const link = usePitwallLink({ engineerUid: () => 'me' })
  return link
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mocks.watches = new Map()
  mocks.attached = []
  mocks.detached = []
  mocks.reads = []
  mocks.outgoing = []
  mocks.incoming = []
  mocks.calls = []
  mocks.refuse = false
  mocks.orderWatch = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('la presenza si ascolta, e costa per cambiamento invece che a tempo', () => {
  it('apre un ascolto per ogni persona utilizzabile, e nessuna lettura a tempo', async () => {
    mocks.outgoing = [outgoing('pilota'), outgoing('popo'), outgoing('spento', false)]
    const link = start()
    await link.refreshPilots()
    link.watchLive()

    // Chi non e' utilizzabile non si guarda: sarebbe un ascolto che non dice
    // mai niente.
    expect(mocks.attached).toEqual(['pilota', 'popo'])

    // Mezz'ora di orologio: con il polling sarebbero state 120 letture.
    vi.advanceTimersByTime(30 * 60_000)
    expect(mocks.reads).toEqual([])

    link.stop()
    expect(mocks.detached.sort()).toEqual(['pilota', 'popo'])
  })

  it('non guarda piu di dodici persone: oltre non e un elenco che si legge', async () => {
    mocks.outgoing = Array.from({ length: 20 }, (_unused, index) => outgoing(`pilota-${index}`))
    const link = start()
    await link.refreshPilots()
    link.watchLive()

    expect(mocks.attached).toHaveLength(12)
    link.stop()
  })

  it('chi entra in pista compare subito, senza aspettare il giro dopo', async () => {
    mocks.outgoing = [outgoing('pilota')]
    const link = start()
    await link.refreshPilots()
    link.watchLive()
    expect(link.pilots.value[0]!.reachable).toBe(false)

    mocks.watches.get('pilota')!({ session: sessionAt(NOW), reachable: true })
    expect(link.pilots.value[0]!.reachable).toBe(true)
    link.stop()
  })

  it('un permesso revocato si porta via il suo ascolto', async () => {
    // Senza, resterebbe aperto a scrivere in un elenco dove quella persona non
    // c'e' piu' - e a costare.
    mocks.outgoing = [outgoing('pilota'), outgoing('popo')]
    const link = start()
    await link.refreshPilots()
    link.watchLive()

    mocks.outgoing = [outgoing('pilota')]
    await link.refreshPilots()
    await Promise.resolve()

    expect(mocks.detached).toEqual(['popo'])
    link.stop()
  })
})

describe('i permessi passano di qui, e un rifiuto diventa una frase', () => {
  it('chiede, ritira, autorizza, decide e cambia la scadenza', async () => {
    const link = start()

    expect(await link.requestLink('pilota', 'once')).toBe(true)
    await link.withdrawRequest('pilota')
    await link.preAuthorise('popo', 'always', null)
    await link.decide('popo', 'granted', 'once', NOW + 3_600_000)
    await link.setExpiry('popo', NOW + 7_200_000)

    expect(mocks.calls.map(call => call[0])).toEqual([
      'requestLink', 'withdraw', 'preAuthorise', 'decideRequest', 'updateGrantExpiry',
    ])
    expect(mocks.calls[0]).toEqual(['requestLink', 'pilota', 'once'])
    link.stop()
  })

  it('un errore del servizio non fa cadere la schermata: diventa un messaggio', async () => {
    mocks.refuse = true
    const link = start()

    expect(await link.requestLink('pilota')).toBe(false)
    expect(link.lastError.value).toBeTruthy()
    link.stop()
  })

  it('le richieste in attesa sono quelle che aspettano una risposta, e la ricerca passa di qui', async () => {
    mocks.incoming = [
      { engineerUid: 'popo', driverUid: 'me', status: 'pending', nickname: 'popo' },
      { engineerUid: 'marik', driverUid: 'me', status: 'granted', nickname: 'marik' },
    ]
    const link = start()
    await link.refreshIncoming()

    // Il numero sul campanello e' questo: solo chi aspetta una decisione.
    expect(link.pendingIncoming.value.map(request => request.engineerUid)).toEqual(['popo'])
    expect(link.grantedIncoming.value.map(request => request.engineerUid)).toEqual(['marik'])

    await link.search('nessuno')
    expect(link.searchResults.value).toEqual([])
    link.stop()
  })

  it('senza account non si chiede niente, e lo si dice', async () => {
    const link = usePitwallLink({ engineerUid: () => null })

    expect(await link.requestLink('pilota')).toBe(false)
    expect(link.lastError.value).toBeTruthy()
    expect(mocks.calls).toEqual([])
    link.stop()
  })
})

describe('la strategia non si dice riuscita finche il PC del pilota non lo conferma', () => {
  it('segue l ordine fino all esito per campo, senza inventarne nessuno', async () => {
    mocks.outgoing = [outgoing('pilota')]
    const link = start()
    await link.refreshPilots()
    link.selectPilot('pilota')

    expect(await link.sendPlan({ fuelLiters: 50 })).toBe(true)
    // Nasce in attesa: nessuno dichiara riuscito cio' che non e' confermato.
    expect(link.orderStatus.value).toBe('pending')

    mocks.orderWatch!({
      status: 'applied',
      result: { reason: null, fields: { fuelLiters: { outcome: 'verified', requested: 50, observed: 50, reason: null } } },
    })
    expect(link.orderStatus.value).toBe('applied')
    expect(link.orderFields.value.fuelLiters?.outcome).toBe('verified')
    link.stop()
  })

  it('senza nessuno selezionato non parte niente', async () => {
    const link = start()
    expect(await link.sendPlan({ fuelLiters: 50 })).toBe(false)
    expect(mocks.calls).toEqual([])
    link.stop()
  })

  it('un ordine rifiutato lo dice, invece di sembrare riuscito', async () => {
    mocks.outgoing = [outgoing('pilota')]
    mocks.refuse = true
    const link = start()
    await link.refreshPilots()
    link.selectPilot('pilota')

    expect(await link.sendPlan({ fuelLiters: 50 })).toBe(false)
    expect(link.orderStatus.value).toBe('rejected')
    expect(link.lastError.value).toBeTruthy()
    link.stop()
  })
})

describe('chi smette sparisce da solo, anche senza notizie', () => {
  it('la riga si spegne al maturare dei novanta secondi, e senza leggere niente', async () => {
    // Un PC che muore non manda nessun evento: senza il decadimento locale
    // l'ultima presenza ricevuta resterebbe "in pista" per sempre.
    mocks.outgoing = [outgoing('pilota')]
    const link = start()
    await link.refreshPilots()
    link.watchLive()
    mocks.watches.get('pilota')!({ session: sessionAt(NOW), reachable: true })
    expect(link.pilots.value[0]!.reachable).toBe(true)

    // Un battito perso due volte non e' una morte: dentro i novanta secondi
    // la riga resta.
    vi.setSystemTime(NOW + 80_000)
    vi.advanceTimersToNextTimer()
    expect(link.pilots.value[0]!.reachable).toBe(true)

    vi.setSystemTime(NOW + 95_000)
    vi.advanceTimersToNextTimer()
    expect(link.pilots.value[0]!.reachable).toBe(false)
    expect(mocks.reads).toEqual([])
    link.stop()
  })
})

describe('a scheda nascosta non si guarda niente', () => {
  it('stacca quando si guarda altrove e riattacca al rientro', async () => {
    // Prima non esisteva nessuna gestione della visibilita in tutto il
    // frontend: le letture giravano identiche per una schermata che nessuno
    // stava leggendo.
    mocks.outgoing = [outgoing('pilota')]
    const link = start()
    await link.refreshPilots()
    link.watchLive()
    expect(mocks.attached).toEqual(['pilota'])

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(mocks.watches.size).toBe(0)
    expect(mocks.detached).toContain('pilota')

    const attachedWhileHidden = mocks.attached.length
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    // Riattacca, e la prima consegna dell'ascolto porta lo stato di adesso:
    // il rientro in focus e' anche l'aggiornamento immediato.
    expect(mocks.watches.size).toBe(1)
    expect(mocks.attached.length).toBeGreaterThan(attachedWhileHidden)

    link.stop()
  })
})
