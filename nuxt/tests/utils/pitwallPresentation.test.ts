import { describe, expect, it } from 'vitest'
import {
  PITWALL_PRESSURE_MAX_PSI,
  PITWALL_PRESSURE_MIN_PSI,
  PITWALL_STOP_TIMING,
  PITWALL_TYRE_SET_MAX,
  PITWALL_TYRE_SET_MIN,
  PITWALL_WHEELS,
  axleWheels,
  buildPitwallChangeChips,
  buildPitwallEcho,
  clampCompound,
  clampFuel,
  clampPressure,
  clampTyreSet,
  estimatePitStop,
  formatCompound,
  formatDelta,
  formatFuel,
  formatFuelDelta,
  formatPressure,
  formatRepairs,
  formatStopDuration,
  formatTyreSet,
  pitwallChangedFields,
  pitwallFieldValue,
  pitwallPlanMatches,
  pressureDelta,
  resolveDriverName,
  resolvePitwallOrderStatus,
  stepAxle,
  stepFuel,
  stepPressure,
  stepTyreSet,
  wheelLabel,
  type PitwallCarState,
  type PitwallDriver,
  type PitwallPlan,
} from '~/utils/pitwallPresentation'

const drivers: PitwallDriver[] = [
  { id: 'driver-1', name: 'Enrico Sayan' },
  { id: 'driver-2', name: 'Marco Rossi' },
]

const plan: PitwallPlan = {
  pressures: { FL: 24.4, FR: 26.1, RL: 24.8, RR: 25.9 },
  fuelLiters: 48,
  compound: 'dry',
  tyreSet: 3,
  driverId: 'driver-2',
  repairBodywork: true,
  repairSuspension: false,
}

const car: PitwallCarState = { ...plan, inPitLane: false }

describe('clampPressure', () => {
  it('mantiene un valore valido su una cifra decimale', () => {
    expect(clampPressure(24.44)).toBe(24.4)
  })

  it('taglia sotto il minimo e sopra il massimo', () => {
    expect(clampPressure(PITWALL_PRESSURE_MIN_PSI - 5)).toBe(PITWALL_PRESSURE_MIN_PSI)
    expect(clampPressure(PITWALL_PRESSURE_MAX_PSI + 5)).toBe(PITWALL_PRESSURE_MAX_PSI)
  })

  it('usa il minimo come fallback per valori non finiti', () => {
    expect(clampPressure(Number.NaN)).toBe(PITWALL_PRESSURE_MIN_PSI)
  })
})

describe('stepPressure', () => {
  it('muove di 0,1 PSI senza errori di virgola mobile', () => {
    expect(stepPressure(24.4, 1)).toBe(24.5)
    expect(stepPressure(24.4, -1)).toBe(24.3)
  })

  it('non esce dai limiti', () => {
    expect(stepPressure(PITWALL_PRESSURE_MAX_PSI, 1)).toBe(PITWALL_PRESSURE_MAX_PSI)
    expect(stepPressure(PITWALL_PRESSURE_MIN_PSI, -1)).toBe(PITWALL_PRESSURE_MIN_PSI)
  })
})

describe('stepAxle', () => {
  const start = { FL: 24.4, FR: 26.1, RL: 24.8, RR: 25.9 }

  it('muove solo le gomme dell asse richiesto', () => {
    expect(stepAxle(start, 'front', 1)).toEqual({ FL: 24.5, FR: 26.2, RL: 24.8, RR: 25.9 })
    expect(stepAxle(start, 'rear', -1)).toEqual({ FL: 24.4, FR: 26.1, RL: 24.7, RR: 25.8 })
  })

  it('muove tutte e quattro le gomme e non muta l originale', () => {
    expect(stepAxle(start, 'all', 1)).toEqual({ FL: 24.5, FR: 26.2, RL: 24.9, RR: 26 })
    expect(start.FL).toBe(24.4)
  })

  it('espone le gomme di ogni asse', () => {
    expect(axleWheels('front')).toEqual(['FL', 'FR'])
    expect(axleWheels('rear')).toEqual(['RL', 'RR'])
    expect(axleWheels('all')).toEqual(['FL', 'FR', 'RL', 'RR'])
  })
})

describe('scarto rispetto alla partenza', () => {
  it('calcola il delta senza errori di virgola mobile', () => {
    expect(pressureDelta(24.7, 24.4)).toBe(0.3)
    expect(pressureDelta(24.1, 24.4)).toBe(-0.3)
    expect(pressureDelta(24.4, 24.4)).toBe(0)
  })

  it('formatta il segno e nasconde lo zero', () => {
    expect(formatDelta(0.3)).toBe('+0,3')
    expect(formatDelta(-0.3)).toBe('−0,3')
    expect(formatDelta(0)).toBe('')
  })
})

describe('carburante', () => {
  it('arrotonda a litri interi dentro i limiti', () => {
    expect(clampFuel(47.6)).toBe(48)
    expect(clampFuel(-10)).toBe(0)
    expect(clampFuel(999)).toBe(140)
  })

  it('muove di un litro per click e si ferma ai limiti', () => {
    expect(stepFuel(48, 1)).toBe(49)
    expect(stepFuel(0, -1)).toBe(0)
    expect(stepFuel(140, 1)).toBe(140)
  })
})

describe('formattazione', () => {
  it('mostra la pressione con la virgola decimale', () => {
    expect(formatPressure(24.4)).toBe('24,4 PSI')
    expect(formatPressure(25)).toBe('25,0 PSI')
  })

  it('mostra il carburante in litri', () => {
    expect(formatFuel(48)).toBe('48 L')
  })

  it('copre le quattro combinazioni di riparazione', () => {
    expect(formatRepairs(false, false)).toBe('Nessuna riparazione')
    expect(formatRepairs(true, false)).toBe('Solo carrozzeria')
    expect(formatRepairs(false, true)).toBe('Solo sospensioni')
    expect(formatRepairs(true, true)).toBe('Carrozzeria + sospensioni')
  })

  it('etichetta ogni ruota', () => {
    expect(PITWALL_WHEELS.map(wheelLabel)).toEqual([
      'Anteriore sinistra',
      'Anteriore destra',
      'Posteriore sinistra',
      'Posteriore destra',
    ])
  })
})

describe('resolveDriverName', () => {
  it('risolve il pilota selezionato', () => {
    expect(resolveDriverName('driver-1', drivers)).toBe('Enrico Sayan')
  })

  it('distingue nessun cambio da id sconosciuto', () => {
    expect(resolveDriverName(null, drivers)).toBe('Nessun cambio pilota')
    expect(resolveDriverName('driver-x', drivers)).toBe('Pilota sconosciuto')
  })
})

describe('pitwallFieldValue', () => {
  it('formatta ogni voce dell ordine', () => {
    expect(pitwallFieldValue(plan, 'FL', drivers)).toBe('24,4 PSI')
    expect(pitwallFieldValue(plan, 'compound', drivers)).toBe('Slick')
    expect(pitwallFieldValue(plan, 'tyreSet', drivers)).toBe('Set 3')
    expect(pitwallFieldValue(plan, 'fuel', drivers)).toBe('48 L')
    expect(pitwallFieldValue(plan, 'driver', drivers)).toBe('Marco Rossi')
    expect(pitwallFieldValue(plan, 'repairs', drivers)).toBe('Solo carrozzeria')
  })

  it('normalizza i valori fuori scala prima di mostrarli', () => {
    const fuori: PitwallPlan = {
      ...plan,
      pressures: { ...plan.pressures, FL: 99 },
      fuelLiters: -3,
      tyreSet: 999,
      driverId: null,
      repairBodywork: false,
    }

    expect(pitwallFieldValue(fuori, 'FL', drivers)).toBe('35,0 PSI')
    expect(pitwallFieldValue(fuori, 'tyreSet', drivers)).toBe(`Set ${PITWALL_TYRE_SET_MAX}`)
    expect(pitwallFieldValue(fuori, 'fuel', drivers)).toBe('0 L')
    expect(pitwallFieldValue(fuori, 'driver', drivers)).toBe('Nessun cambio pilota')
    expect(pitwallFieldValue(fuori, 'repairs', drivers)).toBe('Nessuna riparazione')
  })
})

describe('mescola e set gomme', () => {
  it('tiene il set dentro i limiti, intero', () => {
    expect(clampTyreSet(3.4)).toBe(3)
    expect(clampTyreSet(0)).toBe(PITWALL_TYRE_SET_MIN)
    expect(clampTyreSet(999)).toBe(PITWALL_TYRE_SET_MAX)
  })

  it('muove il set di uno per click senza uscire dai limiti', () => {
    expect(stepTyreSet(3, 1)).toBe(4)
    expect(stepTyreSet(PITWALL_TYRE_SET_MIN, -1)).toBe(PITWALL_TYRE_SET_MIN)
    expect(stepTyreSet(PITWALL_TYRE_SET_MAX, 1)).toBe(PITWALL_TYRE_SET_MAX)
  })

  it('riporta una mescola sconosciuta su dry', () => {
    expect(clampCompound('wet')).toBe('wet')
    expect(clampCompound('intermedie')).toBe('dry')
    expect(clampCompound(undefined)).toBe('dry')
  })

  it('formatta mescola e set', () => {
    expect(formatCompound('dry')).toBe('Slick')
    expect(formatCompound('wet')).toBe('Wet')
    expect(formatTyreSet(3)).toBe('Set 3')
  })

  it('formatta lo scarto carburante col segno', () => {
    expect(formatFuelDelta(6)).toBe('+6 L')
    expect(formatFuelDelta(-6)).toBe('−6 L')
    expect(formatFuelDelta(0)).toBe('')
  })
})

describe('confronto ordine <-> macchina', () => {
  it('non trova differenze quando ordine e macchina coincidono', () => {
    expect(pitwallChangedFields(plan, car)).toEqual([])
    expect(pitwallPlanMatches(plan, car)).toBe(true)
  })

  it('elenca solo le voci davvero diverse', () => {
    const edited: PitwallPlan = {
      ...plan,
      pressures: { ...plan.pressures, FL: 24.7 },
      fuelLiters: 54,
      compound: 'wet',
    }

    expect(pitwallChangedFields(edited, car)).toEqual(['FL', 'compound', 'fuel'])
    expect(pitwallPlanMatches(edited, car)).toBe(false)
  })

  it('vede il cambio pilota e le riparazioni', () => {
    // Nessun pilota scelto significa "non cambiare", non una differenza: il
    // chip si accende solo quando si chiede un pilota diverso da chi guida.
    expect(pitwallChangedFields({ ...plan, driverId: null }, car)).toEqual([])
    expect(pitwallChangedFields({ ...plan, driverId: 'driver-99' }, car)).toEqual(['driver'])
    expect(pitwallChangedFields({ ...plan, repairSuspension: true }, car)).toEqual(['repairs'])
  })
})

describe('buildPitwallEcho', () => {
  const edited: PitwallPlan = {
    ...plan,
    pressures: { ...plan.pressures, FL: 24.7 },
    fuelLiters: 54,
  }

  it('mostra per ogni voce il valore in macchina', () => {
    const echo = buildPitwallEcho(edited, car, drivers)

    expect(echo.FL.carValue).toBe('24,4 PSI')
    expect(echo.fuel.carValue).toBe('48 L')
    expect(echo.driver.carValue).toBe('Marco Rossi')
    expect(echo.repairs.carValue).toBe('Solo carrozzeria')
  })

  it('espone lo scarto solo dove ha senso mostrarlo', () => {
    const echo = buildPitwallEcho(edited, car, drivers)

    expect(echo.FL.delta).toBe('+0,3')
    expect(echo.fuel.delta).toBe('+6 L')
    expect(echo.compound.delta).toBe('')
    expect(echo.driver.delta).toBe('')
  })

  it('marca come cambiate solo le voci diverse', () => {
    const echo = buildPitwallEcho(edited, car, drivers)

    expect(echo.FL.changed).toBe(true)
    expect(echo.fuel.changed).toBe(true)
    expect(echo.FR.changed).toBe(false)
    expect(echo.repairs.changed).toBe(false)
  })
})

describe('buildPitwallChangeChips', () => {
  it('riassume solo cio che sto per mandare', () => {
    const edited: PitwallPlan = { ...plan, fuelLiters: 54 }

    expect(buildPitwallChangeChips(edited, car, drivers)).toEqual([
      { field: 'fuel', label: 'Fuel', value: '54 L', delta: '+6 L' },
    ])
  })

  it('non produce nulla quando non c e differenza', () => {
    expect(buildPitwallChangeChips(plan, car, drivers)).toEqual([])
  })
})

describe('estimatePitStop', () => {
  // Base pulita: nessuna riparazione autorizzata, altrimenti il loro tempo
  // entrerebbe in ogni conto e nasconderebbe cio' che si vuole misurare.
  const fermo: PitwallPlan = { ...plan, repairBodywork: false }
  const autoFerma: PitwallCarState = { ...fermo, inPitLane: false }
  const base = PITWALL_STOP_TIMING.baseSeconds

  it('non stima nessuna sosta quando non c e servizio da fare', () => {
    expect(estimatePitStop(fermo, autoFerma).seconds).toBe(0)
    expect(estimatePitStop(fermo, autoFerma).parts).toEqual([])
  })

  it('conta il rifornimento sui litri da aggiungere, non su quelli finali', () => {
    const piu = estimatePitStop({ ...fermo, fuelLiters: fermo.fuelLiters + 27 }, autoFerma)

    // 27 L / 2,7 L/s = 10 s, piu' i secondi di base.
    expect(piu.seconds).toBe(base + 10)
    expect(piu.parts).toEqual([{ label: 'Rifornimento 27 L', seconds: 10 }])
  })

  it('non conta nulla se l ordine chiede meno carburante di quello gia previsto', () => {
    expect(estimatePitStop({ ...fermo, fuelLiters: fermo.fuelLiters - 10 }, autoFerma).seconds).toBe(0)
  })

  it('fa comandare l operazione piu lunga: il servizio e in parallelo', () => {
    // Gomme (26 s) e rifornimento (10 s) insieme costano quanto le sole gomme.
    const insieme = estimatePitStop({
      ...fermo,
      fuelLiters: fermo.fuelLiters + 27,
      tyreSet: fermo.tyreSet + 1,
    }, autoFerma)

    expect(insieme.seconds).toBe(base + PITWALL_STOP_TIMING.tyreChangeSeconds)
  })

  it('somma le riparazioni al servizio invece di sovrapporle', () => {
    const riparato = estimatePitStop(
      { ...fermo, tyreSet: fermo.tyreSet + 1, repairSuspension: true },
      autoFerma,
    )

    expect(riparato.seconds).toBe(
      base + PITWALL_STOP_TIMING.tyreChangeSeconds + PITWALL_STOP_TIMING.suspensionSeconds,
    )
  })

  it('una sosta di sole riparazioni resta una sosta', () => {
    expect(estimatePitStop({ ...fermo, repairBodywork: true }, autoFerma).seconds)
      .toBe(base + PITWALL_STOP_TIMING.bodyworkSeconds)
  })

  it('vede il cambio pilota e il cambio mescola', () => {
    expect(estimatePitStop({ ...fermo, driverId: 'driver-1' }, autoFerma).parts)
      .toContainEqual({ label: 'Cambio pilota', seconds: PITWALL_STOP_TIMING.driverSwapSeconds })
    expect(estimatePitStop({ ...fermo, compound: 'wet' }, autoFerma).parts)
      .toContainEqual({ label: 'Cambio gomme', seconds: PITWALL_STOP_TIMING.tyreChangeSeconds })
  })
})

describe('formatStopDuration', () => {
  it('mostra i secondi con la virgola sotto il minuto', () => {
    expect(formatStopDuration(32.44)).toBe('32,4 s')
    expect(formatStopDuration(2)).toBe('2,0 s')
  })

  it('passa a minuti e secondi oltre il minuto', () => {
    expect(formatStopDuration(60)).toBe('1:00 min')
    expect(formatStopDuration(72.4)).toBe('1:12 min')
    expect(formatStopDuration(119.7)).toBe('2:00 min')
  })

  it('non mostra un tempo quando non c e sosta', () => {
    expect(formatStopDuration(0)).toBe('—')
    expect(formatStopDuration(Number.NaN)).toBe('—')
  })
})

describe('resolvePitwallOrderStatus', () => {
  const edited: PitwallPlan = { ...plan, fuelLiters: 54 }

  it('dice allineato quando ordine e macchina coincidono', () => {
    const status = resolvePitwallOrderStatus({ plan, car, sentPlan: null })

    expect(status.state).toBe('in-sync')
    expect(status.changedCount).toBe(0)
  })

  it('dice bozza senza ripetere cosa cambia: lo dicono gia i chip', () => {
    const status = resolvePitwallOrderStatus({ plan: edited, car, sentPlan: null })

    expect(status.state).toBe('draft')
    expect(status.detail).toBe('')
    expect(status.changedCount).toBe(1)
  })

  it('tiene il dettaglio solo dove aggiunge il perche', () => {
    const inSync = resolvePitwallOrderStatus({ plan, car, sentPlan: null })
    const pending = resolvePitwallOrderStatus({ plan: edited, car, sentPlan: edited })

    expect(inSync.detail).toBe('')
    expect(pending.detail).not.toBe('')
  })

  it('resta in attesa finche la macchina non ha recepito l ordine', () => {
    const status = resolvePitwallOrderStatus({ plan: edited, car, sentPlan: edited })

    expect(status.state).toBe('pending')
    expect(status.detail).toContain('ferma ai box')
  })

  it('segnala che l applicazione e in corso quando l auto e ai box', () => {
    const status = resolvePitwallOrderStatus({
      plan: edited,
      car: { ...car, inPitLane: true },
      sentPlan: edited,
    })

    expect(status.state).toBe('pending')
    expect(status.detail).toContain('applicazione in corso')
  })

  it('torna allineato quando la macchina ha recepito l ordine', () => {
    const applied: PitwallCarState = { ...edited, inPitLane: false }
    const status = resolvePitwallOrderStatus({ plan: edited, car: applied, sentPlan: edited })

    expect(status.state).toBe('in-sync')
  })

  it('il fallimento ha la precedenza su tutto', () => {
    const status = resolvePitwallOrderStatus({
      plan: edited,
      car,
      sentPlan: edited,
      failureReason: 'Auto non ferma nella pit lane.',
    })

    expect(status.state).toBe('failed')
    expect(status.detail).toBe('Auto non ferma nella pit lane.')
  })
})
