// La logica del muretto, provata da sola (PIP-360).
//
// Prima viveva dentro `PitwallPage.vue` e si provava solo leggendo il sorgente.
// Ora e' un mattoncino con due prese - la stanza e i permessi - e qui si
// infilano due prese finte per verificare cio' che rende corretto un ordine:
// la base solo se fresca, il payload sparso, il preset mai per inerzia, il
// motivo del blocco, l'esito campo per campo.
import { computed, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  PITWALL_FIELD_LABELS,
  usePitwallController,
  type PitwallRoomHandle,
  type PitwallTrustHandle,
} from '~/composables/usePitwallController'

const NOW = Date.parse('2026-09-03T10:00:00.000Z')
const BASELINE = { FL: 24.4, FR: 26.1, RL: 24.8, RR: 25.9 }

type Snapshot = {
  updatedAtMs: number
  nickname: string
  crew: { driverIndex: number, name: string, current: boolean }[] | null
  strategy: Record<string, unknown> | null
}

function crew() {
  return [
    { driverIndex: 0, name: 'RICO117', current: true },
    { driverIndex: 1, name: 'Secondo', current: false },
    { driverIndex: 2, name: 'Terzo', current: false },
  ]
}

function snapshot(ageMs: number, strategy: Record<string, unknown> | null = null): Snapshot {
  return {
    updatedAtMs: NOW - ageMs,
    nickname: 'RICO117',
    crew: crew(),
    strategy: strategy ?? { fuelToAdd: 10, tyreSet: 2, compound: 'dry', pressures: { ...BASELINE } },
  }
}

function fakeLink() {
  const room = ref<{ roomId: string, track: string | null, closedAt: string | null } | null>({ roomId: 'room-1', track: 'Monza', closedAt: null })
  const executor = ref<{ executor: { uid: string } | null, reason: string, conflicting: never[] }>({ executor: { uid: 'pilota' }, reason: 'ready', conflicting: [] })
  return {
    nowTick: ref(NOW),
    carSnapshot: ref<Snapshot | null>(null),
    room,
    executor,
    executorLabel: computed(() => (executor.value.reason === 'ready' ? 'RICO117 al volante' : 'Nessuno al volante: nessun ordine parte.')),
    selectedRoomId: computed(() => room.value?.roomId ?? null),
    roomClosed: computed(() => Boolean(room.value?.closedAt)),
    amMember: ref(true),
    canSend: ref(true),
    crew: ref<{ uid: string }[]>([]),
    orderFields: ref<Record<string, { outcome: 'verified' | 'selected' | 'not-verifiable' | null, reason: string | null } | null>>({}),
    orderStatus: ref<string | null>(null),
    sendPlan: vi.fn(async () => true),
  }
}

function fakeTrust() {
  return {
    pendingIncoming: ref([]),
    grantedIncoming: ref<{ engineerUid: string }[]>([]),
  }
}

function build() {
  const link = fakeLink()
  const trust = fakeTrust()
  const controller = usePitwallController(link as unknown as PitwallRoomHandle, trust as unknown as PitwallTrustHandle)
  return { link, trust, controller }
}

describe('la base dell ordine e la fotografia della vettura, solo se fresca', () => {
  it('senza fotografia non c e una base: l ordine porta tutto quello che sa', () => {
    const { controller } = build()
    expect(controller.carFresh.value).toBe(false)
    expect(controller.drivers.value).toEqual([])
    const payload = controller.planPayload()
    expect(Object.keys(payload).sort()).toEqual(['fuelLiters', 'pressures', 'tyreSet'])
    // Mescola non toccata, preset e caselle a "non toccare": silenzio.
    expect(payload).not.toHaveProperty('compound')
    expect(payload).not.toHaveProperty('pitStrategy')
    expect(payload).not.toHaveProperty('changeTyres')
  })

  it('con la fotografia fresca la strategia parte dalla macchina e l ordine porta solo cio che cambia', async () => {
    const { link, controller } = build()
    link.carSnapshot.value = snapshot(2_000)
    await nextTick()

    expect(controller.carFresh.value).toBe(true)
    expect(controller.presenceAgeSeconds.value).toBe(2)
    expect(controller.fuelLiters.value).toBe(10)
    expect(controller.tyreSet.value).toBe(2)
    expect(controller.pressures.value).toEqual(BASELINE)
    expect(controller.planPayload()).toEqual({})
    expect(controller.hasChanges.value).toBe(false)
    expect(controller.blockedReason.value).toBe('Nessuna modifica da inviare.')

    controller.fuelLiters.value = 15
    expect(controller.planPayload()).toEqual({ fuelLiters: 15 })
    expect(controller.blockedReason.value).toBeNull()

    controller.adjustPressure('FL', 1)
    const payload = controller.planPayload()
    expect(payload.fuelLiters).toBe(15)
    // Le pressioni viaggiano tutte e quattro: il MFD le imposta come blocco.
    expect(payload.pressures).toEqual({ ...BASELINE, FL: 24.5 })
    expect(payload).not.toHaveProperty('tyreSet')

    controller.setCompound('wet')
    expect(controller.planPayload().compound).toBe('wet')
  })

  it('un dato vecchio non e una base: senza freschezza si manda tutto', async () => {
    const { link, controller } = build()
    link.carSnapshot.value = snapshot(120_000)
    await nextTick()
    expect(controller.carFresh.value).toBe(false)
    // Il piano si e' comunque allineato alla fotografia, ma nell'ordine
    // viaggia per intero: chi applica non deve fidarsi di un valore di due
    // minuti fa come "gia' in macchina".
    expect(controller.fuelLiters.value).toBe(10)
    expect(Object.keys(controller.planPayload()).sort()).toEqual(['fuelLiters', 'pressures', 'tyreSet'])
  })

  it('un campo non toccato segue la macchina: dopo Dry->Wet le pressioni riscritte da ACC non tornano indietro', async () => {
    // Visto in pista (PIP-360): mandata la mescola Wet, ACC riscrive le
    // pressioni; il piano teneva ancora quelle della Dry e un ordine di solo
    // carburante le avrebbe riportate di nascosto.
    const { link, controller } = build()
    link.carSnapshot.value = snapshot(1_000)
    await nextTick()
    controller.setCompound('wet')
    await controller.sendToCar()
    expect(link.sendPlan).toHaveBeenLastCalledWith({ compound: 'wet' })

    const WET = { FL: 27.5, FR: 27.5, RL: 27.4, RR: 27.4 }
    link.carSnapshot.value = snapshot(1_000, { fuelToAdd: 10, tyreSet: 2, compound: 'wet', pressures: WET })
    await nextTick()
    expect(controller.pressures.value).toEqual(WET)
    expect(controller.compound.value).toBe('wet')
    expect(controller.planPayload()).toEqual({})

    // Solo carburante: le pressioni non viaggiano. E i battiti successivi della
    // macchina, che dice ancora 10, non riportano indietro il valore toccato.
    controller.fuelLiters.value = 15
    for (let beat = 0; beat < 3; beat += 1) {
      link.carSnapshot.value = snapshot(1_000, { fuelToAdd: 10, tyreSet: 2, compound: 'wet', pressures: WET })
      await nextTick()
    }
    expect(controller.fuelLiters.value).toBe(15)
    expect(controller.planPayload()).toEqual({ fuelLiters: 15 })

    // Un campo toccato invece resta dell'ingegnere anche se la macchina cambia.
    controller.adjustPressure('FL', 1)
    link.carSnapshot.value = snapshot(1_000, { fuelToAdd: 10, tyreSet: 2, compound: 'wet', pressures: { ...WET, FR: 28 } })
    await nextTick()
    expect(controller.pressures.value).toEqual({ FL: 27.6, FR: 28, RL: 27.4, RR: 27.4 })
    expect(controller.fuelLiters.value).toBe(15)
  })

  it('i piloti vengono dall equipaggio della fotografia, e chi guida e la base del cambio', async () => {
    const { link, controller } = build()
    link.carSnapshot.value = snapshot(1_000)
    await nextTick()
    expect(controller.drivers.value.map(driver => driver.name)).toEqual(['RICO117', 'Secondo', 'Terzo'])
    expect(controller.car.value.driverId).toBe('0')
    // Il pilota scelto parte da "non toccare": la tendina non pre-seleziona nessuno.
    expect(controller.driverId.value).toBeNull()
    controller.driverId.value = '1'
    expect(controller.planPayload().driverId).toBe('1')
  })
})

describe('il preset non parte mai per inerzia, e lo spento viaggia', () => {
  it('Off -> 1 -> 2 e ritorno a Off scendendo sotto la prima', () => {
    const { controller } = build()
    expect(controller.pitStrategy.value).toBeNull()
    controller.stepPitStrategy(-1)
    expect(controller.pitStrategy.value).toBeNull()
    controller.stepPitStrategy(1)
    expect(controller.pitStrategy.value).toBe(1)
    controller.stepPitStrategy(1)
    expect(controller.pitStrategy.value).toBe(2)
    expect(controller.planPayload().pitStrategy).toBe(2)
    controller.stepPitStrategy(-1)
    controller.stepPitStrategy(-1)
    expect(controller.pitStrategy.value).toBeNull()
    expect(controller.planPayload()).not.toHaveProperty('pitStrategy')
  })

  it('false e una richiesta, null e silenzio', () => {
    const { controller } = build()
    controller.changeTyres.value = false
    controller.brakes.value = true
    controller.repairSuspension.value = null
    const payload = controller.planPayload()
    expect(payload.changeTyres).toBe(false)
    expect(payload.brakes).toBe(true)
    expect(payload).not.toHaveProperty('repairSuspension')
    expect(payload).not.toHaveProperty('repairBodywork')
  })

  it('consegnate, le caselle tornano a non toccare; se l ordine fallisce restano', async () => {
    const { link, controller } = build()
    controller.changeTyres.value = true
    controller.brakes.value = false
    controller.driverId.value = '1'
    controller.pitStrategy.value = 2
    await controller.sendToCar()
    link.orderStatus.value = 'applying'
    await nextTick()
    expect(controller.changeTyres.value).toBe(true)
    link.orderStatus.value = 'failed'
    await nextTick()
    expect(controller.changeTyres.value).toBe(true)
    link.orderStatus.value = 'applied'
    await nextTick()
    expect([controller.changeTyres.value, controller.brakes.value, controller.driverId.value, controller.pitStrategy.value]).toEqual([null, null, null, null])
    // L'ultimo ordine resta leggibile: e' cio' che "in macchina" mostra per le caselle.
    expect(controller.sentPlan.value).toMatchObject({ changeTyres: true, brakes: false, driverId: '1', pitStrategy: 2 })
    // Un ordine successivo che non le tocca non le cancella dalla memoria.
    controller.repairSuspension.value = true
    await controller.sendToCar()
    expect(controller.sentPlan.value).toMatchObject({ changeTyres: true, brakes: false, driverId: '1', repairSuspension: true })
  })

  it('tornare alla macchina rimette tutto cio che ACC non rilegge a non toccare', async () => {
    const { link, controller } = build()
    link.carSnapshot.value = snapshot(1_000)
    await nextTick()
    controller.changeTyres.value = true
    controller.pitStrategy.value = 3
    controller.fuelLiters.value = 40
    controller.resetToCar()
    expect(controller.changeTyres.value).toBeNull()
    expect(controller.pitStrategy.value).toBeNull()
    expect(controller.fuelLiters.value).toBe(10)
    expect(controller.planPayload()).toEqual({})
  })
})

describe('l invio spento dice quale cosa lo blocca, nell ordine in cui conta', () => {
  it('gara, chiusura, ingresso, volante, poi le modifiche', async () => {
    const { link, controller } = build()
    controller.fuelLiters.value = 5
    link.room.value = null
    expect(controller.blockedReason.value).toBe('Nessuna gara selezionata.')
    link.room.value = { roomId: 'room-1', track: null, closedAt: '2026-09-03T09:00:00.000Z' }
    expect(controller.blockedReason.value).toBe('Questa gara e chiusa: non accetta piu strategie.')
    link.room.value = { roomId: 'room-1', track: null, closedAt: null }
    link.amMember.value = false
    expect(controller.blockedReason.value).toBe('Non sei ancora entrato in questa gara.')
    link.amMember.value = true
    link.executor.value = { executor: null, reason: 'nobody-driving', conflicting: [] }
    expect(controller.blockedReason.value).toBe('Nessuno al volante: nessun ordine parte.')
    link.executor.value = { executor: { uid: 'pilota' }, reason: 'ready', conflicting: [] }
    expect(controller.blockedReason.value).toBeNull()
    await nextTick()
    expect(controller.sendEnabled.value).toBe(true)
    link.canSend.value = false
    expect(controller.sendEnabled.value).toBe(false)
  })

  it('inviare manda il payload sparso e ricorda cosa e partito', async () => {
    const { link, controller } = build()
    link.carSnapshot.value = snapshot(1_000)
    await nextTick()
    controller.tyreSet.value = 3
    await expect(controller.sendToCar()).resolves.toBe(true)
    expect(link.sendPlan).toHaveBeenCalledWith({ tyreSet: 3 })
    expect(controller.sentPlan.value?.tyreSet).toBe(3)
  })
})

describe('l esito resta campo per campo, con le parole del muretto', () => {
  it('traduce le chiavi del PC del pilota e non appiattisce gli esiti', () => {
    const { link, controller } = build()
    link.orderFields.value = {
      fuelLiters: { outcome: 'verified', reason: null },
      pressureFL: { outcome: 'selected', reason: 'Non riletto da ACC' },
      brakes: null,
      sconosciuto: { outcome: 'not-verifiable', reason: null },
    }
    expect(controller.fieldOutcomes.value).toEqual([
      { field: 'fuelLiters', label: 'Carburante', outcome: 'verified', reason: null },
      { field: 'pressureFL', label: 'FL', outcome: 'selected', reason: 'Non riletto da ACC' },
      { field: 'brakes', label: 'Freni', outcome: null, reason: null },
      { field: 'sconosciuto', label: 'sconosciuto', outcome: 'not-verifiable', reason: null },
    ])
    expect(Object.keys(PITWALL_FIELD_LABELS)).toContain('pitStrategy')
  })

  it('chi ho autorizzato ma e gia in gara non compare due volte', () => {
    const { link, trust, controller } = build()
    trust.grantedIncoming.value = [{ engineerUid: 'popo' }, { engineerUid: 'altro' }]
    link.crew.value = [{ uid: 'popo' }]
    expect(controller.trustedEngineers.value.map(entry => entry.engineerUid)).toEqual(['altro'])
  })
})
