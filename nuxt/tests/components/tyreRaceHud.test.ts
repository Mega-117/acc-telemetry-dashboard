import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import TyreRaceHud from '~/components/overlay/TyreRaceHud.vue'
import DamageRaceHud from '~/components/overlay/DamageRaceHud.vue'
import TyreSlipHud from '~/components/overlay/TyreSlipHud.vue'

function fastState() {
  const ids = ['FL', 'FR', 'RL', 'RR'] as const
  return {
    isFresh: true, isLive: true, isEngineRunning: true, pitLimiterOn: false,
    rainIntensity: 0, rainIntensity10Min: 1, rainIntensity30Min: 3,
    tyreCompound: 'DRY', tyreSetAvailable: true, currentTyreSet: 2,
    lapPressureAverage: { status: 'available', tyreSet: 2, values: { FL: 23.1, FR: 23.1, RL: 23.1, RR: 23.1 } },
    tyres: ids.map((id, index) => ({
      id, pressurePsi: 23.2 + index / 10, pressureLossPsi: index === 0 ? .18 : 0,
      racePressure: { variationPsi: index === 0 ? .18 : 0, eventSeq: 0, eventTs: null },
      coreTempC: 76 + index, wheelSlipScaled: 3 + index * 3, slipBand: index === 0 ? 'red' : 'white',
      slipState: 'ok', wheelSlip: 1, slipRatio: 0, brakeTempC: 568 - index * 10,
      brakeCompound: index < 2 ? 1 : 2, padLifePct: 92 - index, discLifePct: 99,
    })),
    damage: {
      body: {
        front: { percentage: 24, repairTimeMs: 6780 }, rear: { percentage: 21, repairTimeMs: 2400 },
        left: { percentage: 0, repairTimeMs: 0 }, right: { percentage: 68, repairTimeMs: 7800 },
        repairTimeMs: 16980,
      },
      suspension: {
        FL: { percentage: 16 }, FR: { percentage: 28 }, RL: { percentage: 7 }, RR: { percentage: 19 },
        repairTimeMs: 21000,
      },
      totalRepairTimeMs: 37980,
    },
  }
}

describe('Race HUD components', () => {
  it('keeps one measured corner visible without applying ACC tyre rules to another game', async () => {
    const base = fastState()
    const partial = { ...base, commonLive: { gameId: 'synthetic' }, tyreCompound: null,
      lapPressureAverage: { status: 'unavailable', values: {} },
      tyres: [{ ...base.tyres[0], pressurePsi: 26.7, coreTempC: 80, wheelSlip: null, wheelSlipScaled: null }] }
    const classic = await renderToString(createSSRApp(TyreSlipHud, { fastState: partial }))
    expect(classic).toContain('26.7 psi')
    expect(classic.match(/WAIT/g)).toHaveLength(4)
    expect(classic).not.toContain('>OK<')
    const race = await renderToString(createSSRApp(TyreRaceHud, { fastState: partial }))
    expect(race).toContain('26.7')
    expect(race).toContain('80')
    expect(race).toContain('fill="#6b7280"')
    expect(race).not.toContain('rgb(0, 200, 0)')
    const stale = await renderToString(createSSRApp(TyreSlipHud, { fastState: { ...partial, isFresh: false } }))
    expect(stale).not.toContain('26.7 psi')
  })
  it('con la fisica dell auto osservata assente la griglia resta, coi valori a --', async () => {
    // PIP-270: prima la pagina spegneva l'intera sezione e restava solo il
    // pannello nero. Il Broadcasting UDP non espone la fisica ruota di un
    // altro pilota, quindi i valori mancano: ma le quattro ruote si vedono.
    const observed = { ...fastState(), dataSource: 'focused', tyres: [] }
    const html = await renderToString(createSSRApp(TyreRaceHud, { fastState: observed }))

    for (const id of ['FL', 'FR', 'RL', 'RR']) expect(html).toContain(id)
    expect(html).toContain('--')
    expect(html).not.toContain('23.2')
    expect(html.match(/AVG --/g)).toHaveLength(4)
  })

  it('rende la gerarchia gomme specchiata con slip, loss e freni', async () => {
    const html = await renderToString(createSSRApp(TyreRaceHud, { fastState: fastState() }))
    expect(html).toContain('23.2')
    expect(html.match(/AVG 23.1/g)).toHaveLength(4)
    expect(html).toContain('0.18')
    expect(html).toContain('tyre-race__brake--front')
    expect(html).toContain('tyre-race__brake--rear')
    expect(html).toContain('tyre-race__compound')
    expect(html).toContain('DRY')
    expect(html).toContain('DRY · SET 2')
    expect(html.match(/tyre-race__corner--rear/g)).toHaveLength(2)
    expect(html).toContain('viewBox="0 0 166 241"')
  })

  it('rende sagoma GT3, quattro body zone, sospensioni e totali', async () => {
    const html = await renderToString(createSSRApp(DamageRaceHud, { fastState: fastState() }))
    expect(html).toContain('Sagoma danni vettura')
    expect(html).toContain('Suspension')
    expect(html).toContain('Total')
    expect(html).toContain('0:21.000')
    expect(html).toContain('0:37.980')
    for (const label of ['FL', 'FR', 'RL', 'RR', '24%', '68%']) expect(html).toContain(label)
  })

  it('nasconde badge sani e mantiene meteo e colori raw nella pagina danni', async () => {
    const state = fastState()
    state.damage!.suspension.FL.percentage = 0
    state.damage!.body.front.rawValue = 99
    const html = await renderToString(createSSRApp(DamageRaceHud, { fastState: state, flash: true }))
    expect(html.match(/class="damage-race__susp"/g)).toHaveLength(3)
    expect(html).toContain('tyre-race__weather')
    expect(html).toContain('damage-race__flash')
    expect(html).toContain('fill="rgba(255,0,0,1)"')
    const unavailable = await renderToString(createSSRApp(DamageRaceHud, { fastState: { ...state, dataSource: 'focused' } }))
    expect(unavailable).toContain('DATA N/A')
    expect(unavailable).not.toContain('class="damage-race__susp"')
  })

  it('mostra AVG per ruota dal giro concluso, indipendente dalla pressione istantanea', async () => {
    const state = fastState()
    state.lapPressureAverage.values = { FL: 26.1, FR: 26.2, RL: 26.3, RR: 26.4 }
    state.tyres[0]!.pressurePsi = 28.5
    const html = await renderToString(createSSRApp(TyreRaceHud, { fastState: state }))
    for (const value of ['26.1', '26.2', '26.3', '26.4']) expect(html).toContain(`AVG ${value}`)
    expect(html).toContain('28.5')
    expect(html).not.toContain('AVG 28.5')
  })

  it('motore spento e limiter coesistono; ogni ruota mostra la propria temperatura freno e pastiglia', async () => {
    const state = { ...fastState(), isEngineRunning: false, pitLimiterOn: true }
    const html = await renderToString(createSSRApp(TyreRaceHud, { fastState: state }))
    expect(html).toContain('tyre-race__engine-off')
    expect(html).toContain('tyre-race__limiter')
    // HUD v2 (27/10): brake temperature and pad wear per corner, no longer one per axle.
    for (const [id, temp, pad] of [['fl', 568, 92], ['fr', 558, 91], ['rl', 548, 90], ['rr', 538, 89]] as const) {
      const corner = html.slice(html.indexOf(`tyre-race__corner--${id}`))
      expect(corner).toMatch(new RegExp(`tyre-race__brake-temp[^>]*>${temp}\u00b0<[\\s\\S]*?tyre-race__pad[^>]*>${pad}%<`))
    }
    expect(html).not.toContain('563\u00b0')
    expect(html).toContain('0:37.980')
  })

  it('HUD v2: front values read pressure, AVG, loss; rear values loss, AVG, pressure', async () => {
    const html = await renderToString(createSSRApp(TyreRaceHud, { fastState: fastState() }))
    const kinds = (id: string) => {
      const start = html.indexOf(`tyre-race__corner--${id}`)
      const values = html.slice(start, html.indexOf('</g>', start))
      return [...values.matchAll(/class="tyre-race__(primary|average|loss)" x="[\d.]+" y="([\d.]+)"/g)]
        .sort((a, b) => Number(a[2]) - Number(b[2])).map(match => match[1])
    }
    for (const id of ['fl', 'fr']) expect(kinds(id)).toEqual(['primary', 'average', 'loss'])
    for (const id of ['rl', 'rr']) expect(kinds(id)).toEqual(['loss', 'average', 'primary'])
  })

  it('HUD v2: the damage section sits under the tyres only when the car is damaged', async () => {
    const damaged = await renderToString(createSSRApp(TyreRaceHud, { fastState: fastState() }))
    expect(damaged).toContain('tyre-race__damage')
    for (const value of ['DANNI', 'Carrozz.', '0:16.980', 'Sospens.', '0:21.000', 'Totale', '0:37.980']) expect(damaged).toContain(value)
    expect(damaged.indexOf('tyre-race__damage')).toBeGreaterThan(damaged.lastIndexOf('tyre-race__corner--rr'))
    const healthy = fastState()
    healthy.damage = {
      body: { front: { percentage: 0, repairTimeMs: 0 }, rear: { percentage: 0, repairTimeMs: 0 }, left: { percentage: 0, repairTimeMs: 0 }, right: { percentage: 0, repairTimeMs: 0 }, repairTimeMs: 0 },
      suspension: { FL: { percentage: 0 }, FR: { percentage: 0 }, RL: { percentage: 0 }, RR: { percentage: 0 }, repairTimeMs: 0 },
      totalRepairTimeMs: 0,
    }
    const clean = await renderToString(createSSRApp(TyreRaceHud, { fastState: healthy }))
    expect(clean).not.toContain('tyre-race__damage')
    expect(clean).not.toContain('DANNI')
    const observed = await renderToString(createSSRApp(TyreRaceHud, { fastState: { ...fastState(), dataSource: 'focused' } }))
    expect(observed).not.toContain('tyre-race__damage')
  })

  it('mantiene quattro posizioni e usa placeholder quando la telemetria locale e parziale', async () => {
    const partial = fastState()
    partial.tyres = partial.tyres.slice(0, 1)
    partial.lapPressureAverage = { status: 'unavailable', tyreSet: null, values: { FL: null, FR: null, RL: null, RR: null } }

    const html = await renderToString(createSSRApp(TyreRaceHud, { fastState: partial }))

    for (const id of ['fl', 'fr', 'rl', 'rr']) expect(html).toContain(`tyre-race__corner--${id}`)
    expect(html.match(/AVG --/g)).toHaveLength(4)
    expect(html).toContain('--')
    expect(html).not.toContain('LOSS 0.00')
  })
})

describe('HUD style v2 (27/10) classic tyres', () => {
  it('drops the speed from the header and keeps id, state, bar, slip and psi per card', async () => {
    const state = { ...fastState(), speedKmh: 187 }
    state.tyres[0]!.slipState = 'lockup'
    const html = await renderToString(createSSRApp(TyreSlipHud, { fastState: state }))
    expect(html).not.toContain('km/h')
    expect(html).not.toContain('187')
    expect(html.match(/class="tyre-slip__bar"/g)).toHaveLength(4)
    expect(html).toContain('23.2 psi')
    expect(html).toMatch(/tyre-slip__meta[^>]*><span[^>]*>1\.0<\/span><span[^>]*>23\.2 psi</)
    expect(html).toContain('tyre-slip--state-lockup')
    expect(html).not.toContain('tyre-slip--waiting')
  })

  it('tints the card more as the state worsens and never while waiting for data', async () => {
    const page = readFileSync(resolve(process.cwd(), 'app/pages/tyres-overlay.vue'), 'utf8')
    const alarm = (state: string) => Number(page.match(new RegExp(String.raw`tyre-slip--state-${state}[^{]*\{ --tyre-slip-alarm: (\d+)%`))?.[1])
    expect(alarm('limit')).toBeLessThan(alarm('sliding'))
    expect(alarm('sliding')).toBeLessThan(alarm('wheelspin'))
    expect(alarm('wheelspin')).toBe(alarm('lockup'))
    expect(page).toContain('.hud-overlay .tyre-slip--waiting { --tyre-slip-alarm: 0%; }')
    expect(page).toMatch(/\.tyre-slip__state,[\s\S]*?\{[^}]*border-radius:\s*999px;[^}]*background:\s*var\(--tyre-slip-color/)
    const waiting = await renderToString(createSSRApp(TyreSlipHud, { fastState: { ...fastState(), isFresh: false } }))
    expect(waiting.match(/tyre-slip--waiting/g)).toHaveLength(4)
  })
})
