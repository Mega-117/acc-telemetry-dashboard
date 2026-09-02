import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PITWALL_ROOM_INVITE_SYNC_MS,
  startPitwallRoomDriver,
} from '~/services/pitwall/pitwallRoomDriverService'
import type { PitwallRoom, PitwallRoomMember, PitwallRoomOrder } from '~/services/pitwall/pitwallRoomContract'

const DRIVER = 'rico'
const ENGINEER = 'popo'
const LATE = 'gilles'
const ROOM_ID = 'gara-1'

function room(overrides: Partial<PitwallRoom> = {}): PitwallRoom {
  return {
    schemaVersion: 2,
    roomId: ROOM_ID,
    label: '#1 · nurburgring',
    hostUid: DRIVER,
    managerUids: [DRIVER],
    memberUids: [DRIVER],
    allowedUids: [],
    vehicleFingerprint: 'ddf3278c2b7485a3',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  }
}

function member(uid: string, driving: boolean): PitwallRoomMember {
  return { uid, nickname: uid.toUpperCase(), kind: 'driver', driving, runtimeSessionId: `rt-${uid}`, updatedAtMs: Date.now() }
}

function order(overrides: Partial<PitwallRoomOrder> = {}): PitwallRoomOrder {
  return {
    schemaVersion: 2,
    orderId: 'ordine-1',
    revision: 1,
    senderId: ENGINEER,
    issuedAt: '2026-09-01T10:00:00.000Z',
    expiresAtMs: Date.now() + 120_000,
    status: 'pending',
    plan: { fuelLiters: 50 },
    ...overrides,
  }
}

/**
 * Servizio stanza finto: registra cosa il lato pilota ha chiesto di fare e
 * permette di far arrivare stanza, membri e ordini quando serve al test.
 */
function fakeService(initial: PitwallRoom = room()) {
  const calls = {
    invites: [] as { roomId: string, trusted: string[] }[],
    claims: [] as string[],
    outcomes: [] as { orderId: string, status: string }[],
    rejections: [] as { orderId: string, reason: string }[],
    presence: [] as { driving: boolean }[],
    reads: [] as string[],
    released: 0,
  }
  let pushRoom: ((next: PitwallRoom) => void) | null = null
  let pushMembers: ((list: PitwallRoomMember[]) => void) | null = null
  let pushOrders: ((list: PitwallRoomOrder[]) => void) | null = null
  let current = initial
  let claimOk = true
  let outcomeOk = true
  let storedOrder: PitwallRoomOrder | null = null

  const service = {
    uid: DRIVER,
    readRoom: async () => current,
    ensureRoomForVehicle: async () => ({ ok: true as const, value: current }),
    listRooms: async () => [current],
    joinRoom: async () => ({ ok: true as const, value: current }),
    leaveRoom: async () => ({ ok: true as const, value: true as const }),
    watchRoom: (_roomId: string, onChange: (next: PitwallRoom | null) => void) => {
      pushRoom = onChange
      return () => { pushRoom = null }
    },
    watchMembers: (_roomId: string, onChange: (list: PitwallRoomMember[]) => void) => {
      pushMembers = onChange
      return () => { pushMembers = null }
    },
    publishPresence: async (_roomId: string, input: { driving: boolean }) => {
      calls.presence.push({ driving: input.driving })
      return { ok: true as const, value: true as const }
    },
    clearPresence: async () => {},
    invite: async () => ({ ok: true as const, value: true as const }),
    revoke: async () => ({ ok: true as const, value: true as const }),
    promote: async () => ({ ok: true as const, value: true as const }),
    closeRoom: async () => ({ ok: true as const, value: true as const }),
    syncInvites: async (roomId: string, trusted: string[]) => {
      calls.invites.push({ roomId, trusted })
      return { ok: true as const, value: trusted.length }
    },
    sendOrder: async () => ({ ok: true as const, value: 'ordine-1' }),
    watchOrder: () => () => {},
    watchPendingOrders: (_roomId: string, onChange: (list: PitwallRoomOrder[]) => void) => {
      pushOrders = onChange
      return () => { pushOrders = null }
    },
    claimOrder: async (_roomId: string, orderId: string) => {
      calls.claims.push(orderId)
      return claimOk
        ? { ok: true as const }
        : { ok: false as const, reason: 'conflict' as const, detail: 'Un altro ordine e gia in applicazione.' }
    },
    publishOutcome: async (_roomId: string, orderId: string, outcome: { status: string }) => {
      calls.outcomes.push({ orderId, status: outcome.status })
      return outcomeOk
        ? { ok: true as const, value: true as const }
        : { ok: false as const, reason: 'Rete assente.' }
    },
    readOrder: async (_roomId: string, orderId: string) => {
      calls.reads.push(orderId)
      return { ok: true as const, value: storedOrder }
    },
    rejectOrder: async (_roomId: string, orderId: string, reason: string) => {
      calls.rejections.push({ orderId, reason })
    },
    releaseClaim: async () => { calls.released += 1 },
  }

  return {
    service: service as never,
    calls,
    setRoom: (next: PitwallRoom) => { current = next; pushRoom?.(next) },
    setMembers: (list: PitwallRoomMember[]) => pushMembers?.(list),
    setOrders: (list: PitwallRoomOrder[]) => pushOrders?.(list),
    failClaim: () => { claimOk = false },
    failOutcome: (value = true) => { outcomeOk = !value },
    setStoredOrder: (next: PitwallRoomOrder | null) => { storedOrder = next },
  }
}

function electron(overrides: Record<string, unknown> = {}) {
  const submitted: unknown[] = []
  return {
    submitted,
    api: {
      pitwallGetLinkStatus: async () => ({ trustedSender: true, driverUid: DRIVER, applying: false, accReady: true, accReason: null, accTransient: false, driverState: 'driving' }),
      pitwallSubmitRemoteOrder: async (payload: unknown) => {
        submitted.push(payload)
        return { accepted: true, status: 'applied', reason: null, fields: {} }
      },
      ...overrides,
    } as never,
  }
}

function startDriver(fake: ReturnType<typeof fakeService>, bridge: ReturnType<typeof electron>, trusted: string[] = []) {
  return startPitwallRoomDriver({
    db: {} as never,
    uid: DRIVER,
    nickname: 'RICO117',
    runtimeSessionId: 'rt-1',
    electronApi: bridge.api,
    service: fake.service,
    readTrustedUids: async () => trusted,
    readVehicle: async () => ({
      fingerprint: 'ddf3278c2b7485a3',
      label: '#1 · nurburgring',
      track: 'nurburgring',
      raceNumber: 1,
      teamName: null,
      driving: true,
      crew: null,
      strategy: null,
    }),
    log: { warn: () => {}, error: () => {} },
  })
}

/** Lascia girare le promise in sospeso senza dipendere da un timer reale. */
async function settle(times = 6) {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
}

describe('il lato pilota tiene gli invitati in pari con la fiducia', () => {
  let handle: ReturnType<typeof startPitwallRoomDriver> | null = null

  afterEach(() => { handle?.stop(); handle = null })

  it('appena trova la gara rimette in pari gli invitati', async () => {
    // Seminare gli inviti solo all apertura non basta: un permesso "solo per
    // oggi" puo scadere cinque minuti prima che la gara si apra.
    const fake = fakeService()
    handle = startDriver(fake, electron(), [ENGINEER])
    await settle(12)

    expect(fake.calls.invites).toHaveLength(1)
    expect(fake.calls.invites[0]!.trusted).toEqual([ENGINEER])
    expect(fake.calls.invites[0]!.roomId).toBe(ROOM_ID)
  })

  it('senza nessuno di cui fidarsi non scrive niente', async () => {
    // Una scrittura a vuoto ogni pochi minuti, per ogni pilota, e proprio il
    // costo che si accumula senza dire niente di nuovo.
    const fake = fakeService()
    handle = startDriver(fake, electron(), [])
    await settle(12)

    expect(fake.calls.invites).toHaveLength(0)
  })

  it('ci riprova col suo passo lento, non a ogni battito', () => {
    expect(PITWALL_ROOM_INVITE_SYNC_MS).toBe(5 * 60_000)
  })
})

describe('il lato pilota guarda la stanza in diretta', () => {
  let handle: ReturnType<typeof startPitwallRoomDriver> | null = null

  afterEach(() => { handle?.stop(); handle = null })

  it('chi entra dopo di noi puo mandare una strategia', async () => {
    // Con una fotografia vecchia dell equipaggio, l ordine di chi e entrato
    // dopo sarebbe arrivato fino al processo main e li rifiutato con "non fa
    // parte di questa gara" — vero solo secondo una copia scaduta.
    const fake = fakeService()
    const bridge = electron()
    handle = startDriver(fake, bridge, [])
    await settle(12)

    fake.setRoom(room({ memberUids: [DRIVER, LATE] }))
    fake.setMembers([member(DRIVER, true)])
    fake.setOrders([order({ senderId: LATE })])
    await settle(20)

    expect(bridge.submitted).toHaveLength(1)
    const payload = bridge.submitted[0] as { room: { memberUids: string[] } }
    expect(payload.room.memberUids).toContain(LATE)
  })
})

describe('il lato pilota applica solo quando tocca a lui', () => {
  let handle: ReturnType<typeof startPitwallRoomDriver> | null = null

  afterEach(() => { handle?.stop(); handle = null })

  it('applica e dichiara l esito quando e lui l unico al volante', async () => {
    const fake = fakeService()
    const bridge = electron()
    handle = startDriver(fake, bridge, [])
    await settle(12)

    fake.setMembers([member(DRIVER, true), member(ENGINEER, false)])
    fake.setOrders([order()])
    await settle(20)

    expect(fake.calls.claims).toEqual(['ordine-1'])
    expect(fake.calls.outcomes).toEqual([{ orderId: 'ordine-1', status: 'applied' }])
    expect(fake.calls.released).toBe(1)
  })

  it('non prende in carico niente se al volante c e un altro', async () => {
    const fake = fakeService()
    const bridge = electron()
    handle = startDriver(fake, bridge, [])
    await settle(12)

    fake.setMembers([member(ENGINEER, true)])
    fake.setOrders([order()])
    await settle(20)

    expect(fake.calls.claims).toHaveLength(0)
    expect(bridge.submitted).toHaveLength(0)
  })

  it('con due al volante non indovina: nessuno prende l ordine', async () => {
    const fake = fakeService()
    const bridge = electron()
    handle = startDriver(fake, bridge, [])
    await settle(12)

    fake.setMembers([member(DRIVER, true), member(ENGINEER, true)])
    fake.setOrders([order()])
    await settle(20)

    expect(fake.calls.claims).toHaveLength(0)
    expect(bridge.submitted).toHaveLength(0)
  })

  it('un ordine scaduto si chiude dicendolo, invece di restare pendente', async () => {
    const fake = fakeService()
    const bridge = electron()
    handle = startDriver(fake, bridge, [])
    await settle(12)

    fake.setMembers([member(DRIVER, true)])
    fake.setOrders([order({ expiresAtMs: Date.now() - 1000 })])
    await settle(20)

    expect(bridge.submitted).toHaveLength(0)
    expect(fake.calls.rejections[0]?.reason).toMatch(/scaduto/i)
  })

  it('se un altro PC ha gia preso la stanza, il secondo ordine viene rifiutato e non accodato', async () => {
    const fake = fakeService()
    const bridge = electron()
    fake.failClaim()
    handle = startDriver(fake, bridge, [])
    await settle(12)

    fake.setMembers([member(DRIVER, true)])
    fake.setOrders([order()])
    await settle(20)

    expect(bridge.submitted).toHaveLength(0)
    expect(fake.calls.rejections[0]?.reason).toMatch(/gia in applicazione/i)
  })

  it('con ACC non pronto per una ragione che non passa, rifiuta subito', async () => {
    const fake = fakeService()
    const bridge = electron({
      pitwallGetLinkStatus: async () => ({
        trustedSender: true, driverUid: DRIVER, applying: false,
        accReady: false, accReason: 'Il pilota e fermo ai box.', accTransient: false, driverState: 'stopped',
      }),
    })
    handle = startDriver(fake, bridge, [])
    await settle(12)

    fake.setMembers([member(DRIVER, true)])
    fake.setOrders([order()])
    await settle(20)

    expect(bridge.submitted).toHaveLength(0)
    expect(fake.calls.rejections[0]?.reason).toMatch(/fermo ai box/i)
  })

  it('con un impedimento che passa da solo aspetta, senza chiudere l ordine', async () => {
    const fake = fakeService()
    const bridge = electron({
      pitwallGetLinkStatus: async () => ({
        trustedSender: true, driverUid: DRIVER, applying: false,
        accReady: false, accReason: 'Telemetria non ancora pronta.', accTransient: true, driverState: 'driving',
      }),
    })
    handle = startDriver(fake, bridge, [])
    await settle(12)

    fake.setMembers([member(DRIVER, true)])
    fake.setOrders([order()])
    await settle(20)

    expect(bridge.submitted).toHaveLength(0)
    expect(fake.calls.rejections).toHaveLength(0)
    expect(fake.calls.claims).toHaveLength(0)
  })
})

describe('il battito dice quello che ACC dice, non quello che si spera', () => {
  let handle: ReturnType<typeof startPitwallRoomDriver> | null = null

  beforeEach(() => { vi.useRealTimers() })
  afterEach(() => { handle?.stop(); handle = null })

  it('pubblica driving derivato dallo stato reale, senza chiedere niente al pilota', async () => {
    const fake = fakeService()
    handle = startDriver(fake, electron(), [])
    await settle(12)

    expect(fake.calls.presence.length).toBeGreaterThan(0)
    expect(fake.calls.presence[0]!.driving).toBe(true)
  })
})

describe('prima accettata vince anche fra due ordini sullo stesso PC', () => {
  let handle: ReturnType<typeof startPitwallRoomDriver> | null = null

  afterEach(() => { handle?.stop(); handle = null })

  it('il secondo ordine arrivato mentre il primo si applica viene rifiutato, non accodato', async () => {
    // Metterli in fila sembrava innocuo - il secondo partiva dieci secondi
    // dopo - ma vuol dire mandare al Pit MFD due strategie di seguito e dire a
    // due ingegneri che sono andate entrambe a buon fine, mentre la macchina ha
    // finito con quella del secondo.
    const fake = fakeService()
    let resolveApply: (() => void) | null = null
    const bridge = electron({
      pitwallSubmitRemoteOrder: async () => {
        await new Promise<void>((resolve) => { resolveApply = resolve })
        return { accepted: true, status: 'applied', reason: null, fields: {} }
      },
    })
    handle = startDriver(fake, bridge, [])
    await settle(12)

    fake.setMembers([member(DRIVER, true)])
    fake.setOrders([order({ orderId: 'ordine-a' })])
    await settle(20)

    // Il primo e' fermo dentro l'applicatore: arriva il secondo.
    fake.setOrders([order({ orderId: 'ordine-b', revision: 2 })])
    await settle(20)

    expect(fake.calls.rejections).toEqual([
      { orderId: 'ordine-b', reason: expect.stringMatching(/gia in applicazione/i) },
    ])
    expect(fake.calls.claims).toEqual(['ordine-a'])

    resolveApply?.()
    await settle(20)
    expect(fake.calls.outcomes).toEqual([{ orderId: 'ordine-a', status: 'applied' }])
  })

  it('finito il primo, la vettura accetta di nuovo', async () => {
    const fake = fakeService()
    const bridge = electron()
    handle = startDriver(fake, bridge, [])
    await settle(12)

    fake.setMembers([member(DRIVER, true)])
    fake.setOrders([order({ orderId: 'ordine-a' })])
    await settle(20)
    fake.setOrders([order({ orderId: 'ordine-b', revision: 2 })])
    await settle(20)

    expect(fake.calls.claims).toEqual(['ordine-a', 'ordine-b'])
    expect(fake.calls.rejections).toHaveLength(0)
  })
})

describe('un errore in mezzo non blocca la vettura per sempre', () => {
  let handle: ReturnType<typeof startPitwallRoomDriver> | null = null

  afterEach(() => { handle?.stop(); handle = null })

  it('dopo un esito che esplode, il prossimo ordine viene comunque preso in carico', async () => {
    // Senza il finally, il segnaposto "sto applicando" restava acceso e ogni
    // ordine successivo veniva rifiutato con la motivazione sbagliata - "un
    // altro ordine e gia in applicazione" - finche non si riavviava l app.
    const fake = fakeService()
    let esplodi = true
    const bridge = electron()
    const rotto = {
      ...(fake.service as unknown as Record<string, unknown>),
      publishOutcome: async (...args: unknown[]) => {
        if (esplodi) { esplodi = false; throw new Error('rete caduta a meta') }
        return (fake.service as never as { publishOutcome: (...a: unknown[]) => Promise<unknown> }).publishOutcome(...args)
      },
    }
    handle = startPitwallRoomDriver({
      db: {} as never,
      uid: DRIVER,
      nickname: 'RICO117',
      runtimeSessionId: 'rt-1',
      electronApi: bridge.api,
      service: rotto as never,
      readTrustedUids: async () => [],
      readVehicle: async () => ({
        fingerprint: 'ddf3278c2b7485a3',
        label: '#1 · nurburgring',
        track: 'nurburgring',
        raceNumber: 1,
        teamName: null,
        driving: true,
        crew: null,
        strategy: null,
      }),
      log: { warn: () => {}, error: () => {} },
    })
    await settle(12)

    fake.setMembers([member(DRIVER, true)])
    fake.setOrders([order({ orderId: 'ordine-a' })])
    await settle(24)

    fake.setOrders([order({ orderId: 'ordine-b', revision: 2 })])
    await settle(24)

    // Il secondo e stato preso in carico, non rifiutato per conflitto.
    expect(fake.calls.claims).toEqual(['ordine-a', 'ordine-b'])
    expect(fake.calls.rejections).toHaveLength(0)
    // E la presa e stata rilasciata anche sul giro esploso.
    expect(fake.calls.released).toBe(2)
  })
})

/**
 * Il caso che questi test coprono e' quello in cui ACC e' **gia'** cambiato:
 * i click sono stati dati, la vettura ha la strategia nuova, e il cloud non lo
 * sa. La rete non si stacca davvero: il fallimento si inietta nel publish, che
 * e' l'unico punto dove quella verita' puo' sparire.
 */
describe('gli esiti che il cloud non ha ancora ricevuto', () => {
  let handle: ReturnType<typeof startPitwallRoomDriver> | null = null

  afterEach(() => { handle?.stop(); handle = null })

  function pendingOutcome(overrides: Record<string, unknown> = {}) {
    return {
      orderId: 'ordine-perso',
      roomId: ROOM_ID,
      driverUid: DRIVER,
      status: 'applied' as const,
      reason: null,
      fields: { fuelLiters: { requested: 50, verified: 50 } },
      appliedAt: '2026-09-01T10:00:05.000Z',
      ...overrides,
    }
  }

  function bridgeWithOutbox(outcomes: ReturnType<typeof pendingOutcome>[]) {
    const confirmed: string[] = []
    const bridge = electron({
      pitwallPendingOutcomes: async () => outcomes,
      pitwallConfirmOutcomes: async (ids: string[]) => {
        confirmed.push(...ids)
        return ids.length
      },
    })
    return { bridge, confirmed }
  }

  it('pubblica al primo avvio utile un esito rimasto su disco', async () => {
    const fake = fakeService()
    const { bridge, confirmed } = bridgeWithOutbox([pendingOutcome()])
    handle = startDriver(fake, bridge)
    await settle(12)

    expect(fake.calls.outcomes).toContainEqual({ orderId: 'ordine-perso', status: 'applied' })
    expect(confirmed).toEqual(['ordine-perso'])
    // La cosa piu' importante di tutte: raccontare non e' rifare.
    expect(bridge.submitted).toHaveLength(0)
  })

  it('se il cloud non risponde tiene il record, senza confermarlo', async () => {
    const fake = fakeService()
    fake.failOutcome()
    // L'ordine lassu' e' ancora aperto: non e' "gia' saputo", e' irraggiungibile.
    fake.setStoredOrder(order({ orderId: 'ordine-perso', status: 'applying' }))
    const { bridge, confirmed } = bridgeWithOutbox([pendingOutcome()])
    handle = startDriver(fake, bridge)
    await settle(12)

    expect(fake.calls.outcomes.length).toBeGreaterThan(0)
    expect(confirmed).toEqual([])
  })

  it('se lassu\' l\'ordine e\' gia\' concluso chiude il record invece di ritentare per sempre', async () => {
    // Le regole accettano l'esito solo finche' l'ordine e' `applying`: una
    // ripubblicazione dopo un ack perso viene negata. Negata non vuol dire
    // fallita - vuol dire che la verita' e' gia' arrivata.
    const fake = fakeService()
    fake.failOutcome()
    fake.setStoredOrder(order({ orderId: 'ordine-perso', status: 'applied' }))
    const { bridge, confirmed } = bridgeWithOutbox([pendingOutcome()])
    handle = startDriver(fake, bridge)
    await settle(12)

    expect(fake.calls.reads).toContain('ordine-perso')
    expect(confirmed).toEqual(['ordine-perso'])
  })

  it('se l\'ordine non esiste piu\' non resta niente da dire', async () => {
    const fake = fakeService()
    fake.failOutcome()
    fake.setStoredOrder(null)
    const { bridge, confirmed } = bridgeWithOutbox([pendingOutcome()])
    handle = startDriver(fake, bridge)
    await settle(12)

    expect(confirmed).toEqual(['ordine-perso'])
  })

  it('non pubblica l\'esito applicato da un altro account su questo computer', async () => {
    // Le regole lo rifiuterebbero comunque: l'esito lo scrive solo chi aveva
    // preso in carico l'ordine. Meglio non chiedere affatto.
    const fake = fakeService()
    const { bridge, confirmed } = bridgeWithOutbox([pendingOutcome({ driverUid: LATE })])
    handle = startDriver(fake, bridge)
    await settle(12)

    expect(fake.calls.outcomes).toHaveLength(0)
    expect(confirmed).toEqual([])
  })

  it('conferma subito l\'esito appena pubblicato di un ordine appena applicato', async () => {
    const fake = fakeService()
    const { bridge, confirmed } = bridgeWithOutbox([])
    handle = startDriver(fake, bridge)
    await settle(12)
    fake.setMembers([member(DRIVER, true)])
    fake.setOrders([order()])
    await settle(20)

    expect(fake.calls.outcomes).toContainEqual({ orderId: 'ordine-1', status: 'applied' })
    expect(confirmed).toEqual(['ordine-1'])
  })
})
