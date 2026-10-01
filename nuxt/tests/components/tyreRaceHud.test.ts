import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import TyreRaceHud from '~/components/overlay/TyreRaceHud.vue'
import DamageRaceHud from '~/components/overlay/DamageRaceHud.vue'

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
    expect(html).toContain('DRY 2')
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

  it('motore spento e limiter coesistono; i numeri freni appartengono alla ruota sinistra', async () => {
    const state = { ...fastState(), isEngineRunning: false, pitLimiterOn: true }
    const html = await renderToString(createSSRApp(TyreRaceHud, { fastState: state }))
    expect(html).toContain('tyre-race__engine-off')
    expect(html).toContain('tyre-race__limiter')
    expect(html).toContain('568\u00b0')
    expect(html).toContain('548\u00b0')
    expect(html).not.toContain('563\u00b0')
    expect(html).toContain('0:37.980')
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
