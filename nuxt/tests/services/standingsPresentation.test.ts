import { describe, expect, it } from 'vitest'
import {
  buildStandingsPresentation as buildStandingsPresentationRaw,
  formatStandingsDriverName,
  formatStandingsLapTime,
  formatStandingsRemainingTime,
  formatStandingsSessionType,
  formatStandingsTemperatures,
  selectStandingsCars,
  standingsCarNumberColors,
  type StandingsCarSnapshot,
  type StandingsHighlightMap,
  type StandingsPresentationOptions,
  type StandingsLocalDriverSnapshot,
  type StandingsStateEnvelope,
} from '../../app/services/overlay/standingsPresentation'

const NOW_MS = 1_785_956_769_847
const STANDINGS_LAYOUT = {
  width: 538,
  height: 340,
  rowCapacity: 10,
  paddingX: 10,
  paddingY: 10,
  headerHeight: 40,
  rowHeight: 28,
  columnGap: 8,
  columnWidths: {
    position: 30,
    driver: 140,
    carNumber: 50,
    pit: 22,
    bestLap: 76,
    lastLap: 76,
    progress: 76,
  },
}

function car(position: number, overrides: Partial<StandingsCarSnapshot> = {}): StandingsCarSnapshot {
  return {
    car_index: 100 + position,
    car_class: 'GT3',
    race_number: position,
    current_driver_index: 0,
    drivers: [{ first_name: 'Alex', last_name: `Driver${position}` }],
    cup_position: position,
    position,
    laps: 10,
    spline_position: position / 10,
    best_lap: { time_ms: 130_000 + position, is_invalid: false, is_valid_for_best: true },
    last_lap: { time_ms: 131_000 + position, is_invalid: false, is_valid_for_best: true },
    car_location: 1,
    realtime_updated_at_ms: NOW_MS - 100,
    has_identity: true,
    has_realtime: true,
    ...overrides,
  }
}

function state(cars: StandingsCarSnapshot[], focusedCarIndex = 108, localCarIndex = focusedCarIndex): StandingsStateEnvelope {
  return {
    status: 'available',
    reason: null,
    snapshot: {
      freshness: { generated_at_ms: NOW_MS - 100, ttl_ms: 5000 },
      session: {
        event_index: 1,
        session_index: 2,
        focused_car_index: focusedCarIndex,
        local_car_index: localCarIndex,
        is_replay: false,
        session_type: 0,
        phase: 4,
        session_time_ms: 60_000,
        session_end_time_ms: 3_661_000,
        weather: { ambient_temp: 22.4, track_temp: 31.6 },
      },
      cars,
    },
  }
}

function buildStandingsPresentation(
  stateValue: StandingsStateEnvelope | null | undefined,
  options: Partial<StandingsPresentationOptions> = {},
  nowMs = NOW_MS,
  highlights: StandingsHighlightMap = {},
  localDriverInput?: StandingsLocalDriverSnapshot | null,
) {
  const clampCount = (value: unknown, fallback: number) => {
    const numeric = Number(value ?? fallback)
    return Math.round(Math.min(Math.max(Number.isFinite(numeric) ? numeric : fallback, 0), 5))
  }
  const rowCapacity = clampCount(options.topCars, 3)
    + clampCount(options.carsAhead, 3)
    + clampCount(options.carsBehind, 3)
    + 1
  const snapshot = stateValue?.snapshot
  const localCarIndex = Number(snapshot?.session.local_car_index)
  const localCar = Number.isInteger(localCarIndex)
    ? snapshot?.cars.find(item => item.car_index === localCarIndex)
    : null
  const localDriver = localDriverInput === undefined && localCar
    ? {
        isFresh: true,
        isLive: true,
        carIndex: localCar.car_index,
        firstName: String(localCar.drivers[0]?.first_name ?? ''),
        lastName: String(localCar.drivers[0]?.last_name ?? ''),
        position: Number(localCar.position),
      }
    : localDriverInput ?? null
  return buildStandingsPresentationRaw(stateValue, {
    ...options,
    standingsLayout: {
      ...STANDINGS_LAYOUT,
      rowCapacity,
      height: STANDINGS_LAYOUT.paddingY * 2
        + STANDINGS_LAYOUT.headerHeight
        + rowCapacity * STANDINGS_LAYOUT.rowHeight,
    },
  }, nowMs, highlights, localDriver)
}

describe('standingsPresentation', () => {
  it('riempie il target adattivo e compensa top/window attorno all’auto locale anche con focus remoto', () => {
    const cars = Array.from({ length: 12 }, (_, index) => car(index + 1))
    cars.push(car(4, { car_index: 204, car_class: 'GT4' }))
    cars.push(car(5, { car_index: 205, realtime_updated_at_ms: NOW_MS - 5001 }))
    const options = {
      topCars: 3,
      carsAhead: 2,
      carsBehind: 2,
    }

    const expected = new Map([
      [101, [1, 2, 3, 4, 5, 6, 7]],
      [102, [1, 2, 3, 4, 5, 6, 7]],
      [104, [1, 2, 3, 4, 5, 6, 7]],
      [112, [1, 2, 3, 8, 9, 10, 12]],
    ])
    expected.forEach((positions, localCarIndex) => {
      const model = buildStandingsPresentation(state(cars, 101, localCarIndex), options, NOW_MS)
      expect(model.rows.map(row => row.position)).toEqual(positions)
      expect(model.rows).toHaveLength(7)
      expect(model.message).toBe('Classifica in aggiornamento…')
      expect(model.rows.filter(row => row.local).map(row => row.carIndex)).toEqual([localCarIndex])
    })
  })

  it('non inventa la classe da altri campi e non nasconde per replay/unavailable UDP', () => {
    const withoutClass = car(8, { car_class: null }) as StandingsCarSnapshot & { cup_category: number }
    withoutClass.cup_category = 0
    const classless = buildStandingsPresentation(state([withoutClass]), {}, NOW_MS)
    expect(classless.visible).toBe(true)
    expect(classless.rows).toHaveLength(1)
    expect(classless.header.carClass).toBeNull()
    expect(classless.message).toBe('Classifica in aggiornamento…')

    const local: StandingsLocalDriverSnapshot = {
      isFresh: true,
      isLive: true,
      carIndex: 108,
      firstName: 'Alex',
      lastName: 'Driver8',
      position: 8,
    }
    const unavailable = buildStandingsPresentation(
      { status: 'unavailable', reason: 'stale', snapshot: null }, {}, NOW_MS, {}, local,
    )
    expect(unavailable.visible).toBe(true)
    expect(unavailable.rows).toHaveLength(1)
    expect(unavailable.message).toBe('Classifica in aggiornamento…')

    const replay = state([car(8)])
    replay.snapshot!.session.is_replay = true
    expect(buildStandingsPresentation(replay, {}, NOW_MS).visible).toBe(true)
  })

  it('filtra righe UDP stale/non affidabili ma conserva sempre la riga locale shared-memory', () => {
    const staleLocal = state([car(8, { realtime_updated_at_ms: NOW_MS - 5001 })])
    const unidentifiedLocal = state([car(8, { has_identity: false })])
    const unrankedLocal = state([car(8, { position: 0 })])
    for (const candidate of [staleLocal, unidentifiedLocal, unrankedLocal]) {
      const model = buildStandingsPresentation(candidate, {}, NOW_MS)
      expect(model.visible).toBe(true)
      expect(model.rows).toHaveLength(1)
      expect(model.rows[0].local).toBe(true)
    }
  })

  it('apre LIVE prima di UDP e mostra pilota locale con recovery neutro', () => {
    const local: StandingsLocalDriverSnapshot = {
      isFresh: true,
      isLive: true,
      carIndex: 17,
      firstName: 'Enrico',
      lastName: 'Saiani',
      position: 4,
    }
    const model = buildStandingsPresentation(
      { status: 'unavailable', reason: 'read-error', snapshot: null }, {}, NOW_MS, {}, local,
    )

    expect(model.visible).toBe(true)
    expect(model.message).toBe('Classifica in aggiornamento…')
    expect(model.rows).toEqual([expect.objectContaining({
      carIndex: 17,
      position: 4,
      driverName: 'E. Saiani',
      local: true,
    })])
  })

  it('con entry list tardiva o classe locale mancante non mostra classifiche multi-classe', () => {
    const local = car(8, { car_class: null })
    const opponent = car(2, { car_index: 202, car_class: 'GT3' })
    const model = buildStandingsPresentation(
      state([opponent, local], 108, 108),
      { topCars: 3, carsAhead: 3, carsBehind: 3 },
      NOW_MS,
    )

    expect(model.visible).toBe(true)
    expect(model.header.carClass).toBeNull()
    expect(model.rows.map(row => row.carIndex)).toEqual([108])
    expect(model.message).toBe('Classifica in aggiornamento…')
  })

  it('locale senza avversari resta visibile senza inventare altre righe', () => {
    const model = buildStandingsPresentation(state([car(8)]), {}, NOW_MS)
    expect(model.visible).toBe(true)
    expect(model.rows).toHaveLength(1)
    expect(model.rows[0].local).toBe(true)
    expect(model.message).toBeNull()
  })

  it('non ricava la riga locale dal solo UDP quando shared-memory manca', () => {
    const model = buildStandingsPresentation(state([car(8)]), {}, NOW_MS, {}, null)
    expect(model.visible).toBe(true)
    expect(model.rows).toEqual([])
    expect(model.message).toBe('Classifica in aggiornamento…')
  })

  it('ordina con la posizione assoluta ACC e mostra la posizione derivata nella classe', () => {
    const model = buildStandingsPresentation(state([
      car(1, { car_index: 101, position: 1, cup_position: 1 }),
      car(2, { car_index: 102, position: 4, cup_position: 1 }),
      car(3, { car_index: 103, position: 7, cup_position: 2 }),
    ], 102), { topCars: 3, carsAhead: 0, carsBehind: 0 }, NOW_MS)
    expect(model.rows.map(row => row.position)).toEqual([1, 2, 3])
  })

  it('espone soltanto celle supportate e lascia null i valori assenti', () => {
    const raw = car(8, {
      race_number: null,
      current_driver_index: 9,
      best_lap: null,
      best_lap_ms: null,
      last_lap: null,
      last_lap_ms: null,
      spline_position: null,
    })
    const model = buildStandingsPresentation(state([raw]), {
      showCarNumber: true,
      showFastestLap: true,
      showLastLap: true,
      showLapProgressBar: true,
    }, NOW_MS)
    expect(model.rows[0]).toMatchObject({
      carNumber: null,
      driverName: 'A. Driver8',
      bestLap: null,
      lastLap: null,
      progressPercent: null,
      hasProgress: false,
    })
    expect(model.rows[0]).not.toHaveProperty('delta')
    expect(model.rows[0]).not.toHaveProperty('teamName')
    expect(model.rows[0]).not.toHaveProperty('laps')
    expect(model.rows[0]).not.toHaveProperty('lfmElo')
    expect(model.rows[0]).not.toHaveProperty('incidents')
    expect(model.rows[0]).not.toHaveProperty('stintTimer')
    expect(model.layout).toEqual(STANDINGS_LAYOUT)
  })

  it('clampa i conteggi 0-5 e marca il best di classe senza includere righe extra', () => {
    const model = buildStandingsPresentation(state([car(1), car(8), car(9)]), {
      topCars: 99,
      carsAhead: -2,
      carsBehind: 0,
      showCarNumber: false,
      showFastestLap: true,
      showLastLap: false,
      showLapProgressBar: false,
    }, NOW_MS)
    expect(model.rows.map(row => row.position)).toEqual([1, 2, 3])
    expect(model.rows[0].fastestInClass).toBe(true)
    expect(model.columns).toEqual({ carNumber: false, lastLap: false, bestLap: true, progress: false })
    expect(model.rows.every(row => row.carNumber === null && row.lastLap === null && row.progressPercent === null)).toBe(true)
  })

  it('costruisce l’header supportato nell’ordine dati canonico', () => {
    const model = buildStandingsPresentation(state([car(8)]), {}, NOW_MS)
    expect(model.header).toEqual({
      sessionType: 'Practice',
      timeLeft: '01:01:01',
      temperatures: '22/32°',
      carClass: 'GT3',
    })
    expect(formatStandingsSessionType(0)).toBe('Practice')
    expect(formatStandingsSessionType(4)).toBe('Qualifying')
    expect(formatStandingsSessionType(9)).toBe('Superpole')
    expect(formatStandingsSessionType(10)).toBe('Race')
    expect(formatStandingsSessionType(2)).toBeNull()
    expect(formatStandingsRemainingTime(5000, 4000)).toBe('00:00:04')
    expect(formatStandingsRemainingTime(null, 4000)).toBeNull()
    expect(formatStandingsTemperatures({ ambient_temp: 23.6, track_temp: 31.2 })).toBe('24/31°')
    expect(formatStandingsTemperatures({ ambient_temp: 20, track_temp: null })).toBeNull()
  })

  it('formatta pilota, tempi e palette numero senza fallback inventati', () => {
    expect(formatStandingsLapTime(125_678)).toBe('2:05.678')
    expect(formatStandingsLapTime(null)).toBeNull()
    expect(formatStandingsDriverName(car(1))).toBe('A. Driver1')
    expect(formatStandingsDriverName(car(1, {
      drivers: [{ first_name: '', last_name: 'Driver1' }],
    }))).toBe('. Driver1')
    expect(formatStandingsDriverName(car(1, {
      drivers: [{ first_name: 'Alex', last_name: '' }],
    }))).toBe('NoData')
    expect(formatStandingsDriverName(car(1, { drivers: [], current_driver_index: 0 }))).toBe('NoData')
    expect(standingsCarNumberColors('GT3')).toEqual({ background: 'transparent', color: 'white' })
    expect(standingsCarNumberColors('GT4').background).toBe('rgb(38, 38, 69)')
    expect(standingsCarNumberColors('ST').background).toBe('rgb(204, 168, 0)')
    expect(standingsCarNumberColors('Cup').background).toBe('rgb(69, 124, 69)')
    expect(standingsCarNumberColors('CHL').background).toBe('red')
    expect(standingsCarNumberColors('TCX').background).toBe('rgb(0, 124, 167)')
    expect(standingsCarNumberColors('GT2').background).toBe('darkred')
  })

  it('mostra progress solo non-Race e forza zero in pit lane', () => {
    const practice = state([
      car(8, { car_location: 2, spline_position: 0.75 }),
      car(9, { spline_position: 0.42 }),
    ])
    const practiceModel = buildStandingsPresentation(practice, { topCars: 0, carsAhead: 0, carsBehind: 1 }, NOW_MS)
    expect(practiceModel.columns.progress).toBe(true)
    expect(practiceModel.rows.map(row => row.progressPercent)).toEqual([0, 42])
    expect(practiceModel.rows.map(row => row.hasProgress)).toEqual([false, true])
    expect(practiceModel.rows.map(row => row.inPitLane)).toEqual([true, false])

    practice.snapshot!.session.session_type = 10
    const raceModel = buildStandingsPresentation(practice, {}, NOW_MS)
    expect(raceModel.columns.progress).toBe(true)
    expect(raceModel.rows.every(row => row.progressPercent === null)).toBe(true)
    expect(raceModel.rows.every(row => row.hasProgress === false)).toBe(true)
  })

  it('la riga locale sopprime il flash posizione secondario ma conserva dati PB', () => {
    const model = buildStandingsPresentation(state([car(7), car(8)], 107, 108), {}, NOW_MS, {
      108: { positionFlash: 'improved', lastLapPersonalBest: 'focused' },
    })
    expect(model.rows.find(row => row.local)).toMatchObject({
      positionFlash: null,
      lastLapPersonalBest: 'focused',
    })
  })

  it('header e classe seguono l’auto locale senza inferire dal focus', () => {
    const model = buildStandingsPresentation(state([
      car(1, { car_index: 101, car_class: 'GT4' }),
      car(8, { car_index: 108, car_class: 'GT3' }),
    ], 101, 108), { topCars: 0, carsAhead: 0, carsBehind: 0 }, NOW_MS)
    expect(model.header.carClass).toBe('GT3')
    expect(model.rows).toHaveLength(1)
    expect(model.rows[0]).toMatchObject({ carIndex: 108, local: true })
  })

  it('la selezione pura non oltrepassa il roster disponibile', () => {
    const cars = [car(1), car(2)]
    expect(selectStandingsCars(cars, 1, { topCars: 5, carsAhead: 5, carsBehind: 5 })).toEqual(cars)
    expect(selectStandingsCars(cars, -1, { topCars: 3, carsAhead: 3, carsBehind: 3 })).toEqual([])
  })
})
