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

// Classic v2 (28/10): slip and psi sit in fixed-width digit slots; read them as plain text.
async function renderClassic(state: unknown) {
  const html = await renderToString(createSSRApp(TyreSlipHud, { fastState: state }))
  return html.replace(/<!--[[\]]-->/g, '')
    .replace(/<span class="hud-fixed-digits__glyph"[^>]*>([^<]*)<\/span>/g, '$1')
    .replace(/<span class="hud-fixed-digits"[^>]*>([^<]*)<\/span>/g, '$1')
    .replace(/<small[^>]*>([^<]*)<\/small>/g, '$1')
}

// PIP-671: HTML readings; drop the SSR fragment comments to read the lines as the pilot does.
async function renderRace(state: unknown) {
  const html = await renderToString(createSSRApp(TyreRaceHud, { fastState: state }))
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

describe('Race HUD components', () => {
  it('keeps one measured corner visible without applying ACC tyre rules to another game', async () => {
    const base = fastState()
    const partial = { ...base, commonLive: { gameId: 'synthetic' }, tyreCompound: null,
      lapPressureAverage: { status: 'unavailable', values: {} },
      tyres: [{ ...base.tyres[0], pressurePsi: 26.7, coreTempC: 80, wheelSlip: null, wheelSlipScaled: null }] }
    const classic = await renderClassic(partial)
    expect(classic).toContain('26.7 psi')
    expect(classic.match(/WAIT/g)).toHaveLength(4)
    expect(classic).not.toContain('>OK<')
    const race = await renderRace(partial)
    expect(race).toContain('26.7')
    expect(race).toContain('80')
    expect(race).toContain('--t:#6b7280')
    expect(race).not.toContain('rgb(0, 200, 0)')
    const stale = await renderClassic({ ...partial, isFresh: false })
    expect(stale).not.toContain('26.7 psi')
  })
  it('con la fisica dell auto osservata assente la griglia resta, coi valori a --', async () => {
    // PIP-270: prima la pagina spegneva l'intera sezione e restava solo il
    // pannello nero. Il Broadcasting UDP non espone la fisica ruota di un
    // altro pilota, quindi i valori mancano: ma le quattro ruote si vedono.
    const observed = { ...fastState(), dataSource: 'focused', tyres: [] }
    const html = await renderRace(observed)

    for (const id of ['FL', 'FR', 'RL', 'RR']) expect(html).toContain(id)
    expect(html).toContain('--')
    expect(html).not.toContain('23.2')
    expect(html.match(/AVG --/g)).toHaveLength(4)
  })

  it('rende la gerarchia gomme specchiata con slip, loss e freni', async () => {
    const html = await renderRace(fastState())
    expect(html).toContain('23.2')
    expect(html.match(/AVG 23.1/g)).toHaveLength(4)
    expect(html).toContain('0.18')
    expect(html).toContain('tyre-race__brake--front')
    expect(html).toContain('tyre-race__brake--rear')
    expect(html).toContain('tyre-race__compound')
    expect(html).toContain('DRY')
    expect(html).toContain('DRY · SET 2')
    expect(html.match(/tyre-race__corner--rear/g)).toHaveLength(2)
    // Slip bar filled from the bottom, tyre coloured by the temperature scale, brake by its own scale.
    expect(html.match(/class="tyre-race__slip"[^>]*><b[^>]*style="height:/g)).toHaveLength(4)
    expect(html.match(/class="tyre-race__tyre"[^>]*style="--t:/g)).toHaveLength(4)
    expect(html.match(/class="tyre-race__brake--(front|rear) tyre-race__brake"[^>]*style="background:/g)).toHaveLength(4)
  })

  it('PIP-671: the yellow flag frame belongs to the outer panel, not to the tyres component', async () => {
    const html = await renderRace({ ...fastState(), flag: 2 })
    expect(html).not.toContain('#ffd400')
    // The frame is on the whole outer panel (weather strip included), tyres and Damage pages alike.
    const page = readFileSync(resolve(process.cwd(), 'app/pages/tyres-overlay.vue'), 'utf8')
    expect(page).toMatch(/class="hud-overlay__panel"\s*:class="\{[^}]*'hud-overlay__panel--yellow-flag': displayFastState\.flag === 2,/)
    expect(page).toContain("'hud-overlay__panel--yellow-flag', $hud-flag-width);")
    expect(page).not.toContain('race-hud--yellow-flag')
    const damage = await renderToString(createSSRApp(DamageRaceHud, { fastState: { ...fastState(), flag: 2 } }))
    expect(damage).toContain('stroke="#ffd400"')
  })

  it('PIP-671: the pressure-drop event and an overheated tyre show the caution look on that wheel only', async () => {
    const state = fastState()
    state.tyres[0]!.racePressure = { variationPsi: -0.72, eventSeq: 3, eventTs: Date.now() / 1000 } as any
    state.tyres[1]!.coreTempC = 104
    const html = await renderRace(state)
    const corner = (id: string) => {
      const at = html.indexOf(`tyre-race__corner--${id}`)
      return html.slice(at, html.indexOf('"', at))
    }
    expect(corner('fl')).toContain('tyre-race__corner--warn')
    expect(corner('fr')).toContain('tyre-race__corner--warn')
    expect(corner('rl')).not.toContain('tyre-race__corner--warn')
    expect(html.match(/tyre-race__corner--warn/g)).toHaveLength(2)
    // An old event never re-lights the caution.
    state.tyres[0]!.racePressure = { variationPsi: -0.72, eventSeq: 3, eventTs: Date.now() / 1000 - 10 } as any
    state.tyres[1]!.coreTempC = 99
    expect(await renderRace(state)).not.toContain('tyre-race__corner--warn')
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
    const html = await renderRace(state)
    for (const value of ['26.1', '26.2', '26.3', '26.4']) expect(html).toContain(`AVG ${value}`)
    expect(html).toContain('28.5')
    expect(html).not.toContain('AVG 28.5')
  })

  it('limiter sull asse posteriore, niente ENGINE OFF; un freno per asse: il piu caldo e la pastiglia piu bassa', async () => {
    const state = { ...fastState(), isEngineRunning: false, pitLimiterOn: true }
    const html = await renderRace(state)
    const front = html.slice(html.indexOf('tyre-race__axle-brake--front'), html.indexOf('class="tyre-race__compound"'))
    const rear = html.slice(html.indexOf('tyre-race__axle-brake--rear'))
    // Owner (30/10): the tyres page shows no ENGINE OFF box.
    expect(html).not.toContain('ENGINE')
    expect(rear).toContain('tyre-race__limiter')
    expect(html.match(/tyre-race__brake-temp/g)).toHaveLength(2)
    // Approved draft (30/10): hottest brake and lowest pad of the axle, not an average.
    expect(front).toMatch(/tyre-race__brake-temp[^>]*>568°<[\s\S]*?tyre-race__pad[^>]*>91%</)
    expect(rear).toMatch(/tyre-race__brake-temp[^>]*>548°<[\s\S]*?tyre-race__pad[^>]*>89%</)
    // The Damage page keeps its boxes where they were.
    const damage = await renderToString(createSSRApp(DamageRaceHud, { fastState: state }))
    expect(damage).toMatch(/tyre-race__engine-off[^>]*><rect x="43" y="40" width="80" height="48"/)
    expect(damage).toMatch(/tyre-race__limiter[^>]*><rect x="43" y="152" width="80" height="48"/)
  })

  it('front values read pressure, AVG, loss; rear values loss, AVG, pressure', async () => {
    const html = await renderRace(fastState())
    const kinds = (id: string) => {
      const start = html.indexOf(`tyre-race__corner--${id}`)
      const block = html.slice(start, html.indexOf('tyre-race__hardware', start))
      return [...block.matchAll(/class="tyre-race__(primary|average|loss)"/g)].map(match => match[1])
    }
    for (const id of ['fl', 'fr']) expect(kinds(id)).toEqual(['primary', 'average', 'loss'])
    for (const id of ['rl', 'rr']) expect(kinds(id)).toEqual(['loss', 'average', 'primary'])
  })

  it('damage is the total repair time on the right of the middle line, only when damaged', async () => {
    const damaged = await renderRace(fastState())
    const line = damaged.slice(damaged.indexOf('class="tyre-race__compound"'), damaged.indexOf('tyre-race__axle--rear'))
    expect(line).toContain('DRY · SET 2')
    expect(line).toMatch(/class="tyre-race__damage"[^>]*><span aria-hidden="true"[^>]*>⚠<\/span>37\.9 s</)
    expect(damaged).toContain('tyre-race--damaged')
    // No separate damage section any more.
    for (const value of ['Carrozz.', 'Sospens.', 'Totale', '0:16.980', '0:21.000']) expect(damaged).not.toContain(value)
    const healthy = fastState()
    healthy.damage = {
      body: { front: { percentage: 0, repairTimeMs: 0 }, rear: { percentage: 0, repairTimeMs: 0 }, left: { percentage: 0, repairTimeMs: 0 }, right: { percentage: 0, repairTimeMs: 0 }, repairTimeMs: 0 },
      suspension: { FL: { percentage: 0 }, FR: { percentage: 0 }, RL: { percentage: 0 }, RR: { percentage: 0 }, repairTimeMs: 0 },
      totalRepairTimeMs: 0,
    }
    const clean = await renderRace(healthy)
    expect(clean).not.toContain('tyre-race__damage')
    expect(clean).not.toContain('tyre-race--damaged')
    expect(clean).toContain('DRY · SET 2')
    const observed = await renderRace({ ...fastState(), dataSource: 'focused' })
    expect(observed).not.toContain('tyre-race__damage')
  })

  it('mantiene quattro posizioni e usa placeholder quando la telemetria locale e parziale', async () => {
    const partial = fastState()
    partial.tyres = partial.tyres.slice(0, 1)
    partial.lapPressureAverage = { status: 'unavailable', tyreSet: null, values: { FL: null, FR: null, RL: null, RR: null } }

    const html = await renderRace(partial)

    for (const id of ['fl', 'fr', 'rl', 'rr']) expect(html).toContain(`tyre-race__corner--${id}`)
    expect(html.match(/AVG --/g)).toHaveLength(4)
    expect(html).toContain('--')
    expect(html).not.toContain('LOSS 0.00')
    // Axle brake: the front reads only the side that exists, the rear has none.
    const front = html.slice(html.indexOf('tyre-race__axle-brake--front'))
    expect(front).toMatch(/tyre-race__brake-temp[^>]*>568°<[\s\S]*?tyre-race__pad[^>]*>92%</)
    const rear = html.slice(html.indexOf('tyre-race__axle-brake--rear'))
    expect(rear).toMatch(/tyre-race__brake-temp[^>]*>--°<[\s\S]*?tyre-race__pad[^>]*>--%</)
  })
})

describe('HUD style v2 (27/10) classic tyres', () => {
  it('drops the speed from the header and keeps id, state, bar, slip and psi per tile', async () => {
    const state = { ...fastState(), speedKmh: 187 }
    state.tyres[0]!.slipState = 'lockup'
    const html = await renderClassic(state)
    expect(html).not.toContain('km/h')
    expect(html).not.toContain('187')
    expect(html.match(/class="tyre-slip__bar"/g)).toHaveLength(4)
    expect(html).toContain('23.2 psi')
    expect(html).toMatch(/tyre-slip__meta[^>]*><span class="tyre-slip__slip"[^>]*>1\.0 slip<\/span><span class="tyre-slip__psi"[^>]*>23\.2 psi</)
    expect(html).toContain('tyre-slip--state-lockup')
    expect(html).not.toContain('tyre-slip--waiting')
  })

  it('classic aligned (28/10): flat tiles, state as coloured text, no tag, band or cut', async () => {
    const page = readFileSync(resolve(process.cwd(), 'app/pages/tyres-overlay.vue'), 'utf8')
    const html = await renderToString(createSSRApp(TyreSlipHud, { fastState: fastState() }))
    // Flat tile: no border, cut, left band or diagonal line of its own.
    const tile = page.match(/\.hud-overlay \.tyre-slip \{([^}]*)\}/)?.[1] ?? ''
    expect(tile).toContain('border: 0;')
    expect(tile).toContain('border-radius: 0;')
    expect(tile).not.toContain('clip-path')
    expect(page).not.toContain('.tyre-slip::before')
    expect(page).not.toContain('tyre-slip__cut')
    expect(html).not.toContain('tyre-slip__cut')
    // The state is coloured text in the slip colour: no filled tag, grey while waiting.
    expect(html.match(/<span class="tyre-slip__state">OK<\/span>/g)).toHaveLength(4)
    const state = page.match(/\.tyre-slip--state-lockup \.tyre-slip__state \{([^}]*)\}/)?.[1] ?? ''
    expect(state).toContain('background: transparent;')
    expect(state).toContain('padding: 0;')
    expect(state).toContain('color: var(--tyre-slip-color, #f4f4f6);')
    expect(page).toContain('.hud-overlay .tyre-slip--waiting .tyre-slip__state { color: #a3a5ae; }')
    // Owner (28/10): square outer panel with an even scaled margin; tiles fill the width; yellow frame kept.
    expect(page).toMatch(/\.hud-overlay__panel \{[^}]*padding: calc\(12px \* var\(--hud-scale\)\);[^}]*border-radius: 0;/)
    expect(page).toMatch(/\.tyre-slip-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/)
    // PIP-671: the yellow frame follows the whole outline through the shared mixin.
    // Owner (30/10): square panel, no title bar.
    expect(page).toContain("@include hud-cut-corner(0px, 0px, $hud-hairline-width, $hud-hairline-color, 'hud-overlay__panel--yellow-flag', $hud-flag-width);")
    expect(page).toContain('.hud-overlay .tyre-slip-hud__header { display: none; }')
  })

  it('classic aligned (28/10): guide type scale in the italic numbers font, with the 0.6 floors', () => {
    const page = readFileSync(resolve(process.cwd(), 'app/pages/tyres-overlay.vue'), 'utf8')
    const font = (selector: RegExp) => page.match(new RegExp(String.raw`${selector.source} \{[^}]*font: ([^;]*);`))?.[1]
    // Wheel id 16, values 20, state 13, units 11 (no title bar, owner 30/10); labels never below 12px, values 14px.
    expect(font(/\.tyre-slip__topline strong/)).toBe('italic 700 max(12px, calc(16px * var(--hud-scale)))/1 var(--hud-font-num)')
    expect(font(/\.tyre-slip__psi/)).toBe('italic 700 max(14px, calc(20px * var(--hud-scale)))/1 var(--hud-font-num)')
    expect(font(/\.tyre-slip--state-lockup \.tyre-slip__state/)).toBe('italic 700 max(12px, calc(13px * var(--hud-scale)))/1 var(--hud-font-num)')
    // Units small and grey.
    expect(page).toMatch(/\.tyre-slip__meta small \{[^}]*color: #a3a5ae;[^}]*font: italic 700 max\(11px, calc\(11px \* var\(--hud-scale\)\)\)\/1 var\(--hud-font-num\);/)
  })

  it('classic aligned: straight gauge, ONE continuous fill sized by the slip formula, no separators (owner 30/10)', async () => {
    const page = readFileSync(resolve(process.cwd(), 'app/pages/tyres-overlay.vue'), 'utf8')
    const state = fastState()
    const html = await renderToString(createSSRApp(TyreSlipHud, { fastState: state }))
    // wheelSlipScaled 3, 6, 9, 12 → 3/18, 6/18 ... of the bar: a continuous width, not whole steps.
    const widths = [...html.matchAll(/class="tyre-slip__fill" style="width:([\d.]+)%;"/g)].map(match => Number(match[1]))
    expect(widths).toHaveLength(4)
    widths.forEach((width, index) => expect(width).toBeCloseTo(((3 + index * 3) / 18) * 100, 5))
    expect(widths[0]! % 10).not.toBe(0)
    // One fill and one separator layer per gauge, the separators drawn over the fill.
    expect(html.match(/class="tyre-slip__fill"/g)).toHaveLength(4)
    expect(html.match(/<i class="tyre-slip__ticks"><\/i>/g)).toHaveLength(4)
    expect(html).toMatch(/<div class="tyre-slip__bar" style="--tyre-slip-ticks:10;" aria-hidden="true"><span class="tyre-slip__fill"[^>]*><\/span><i class="tyre-slip__ticks"><\/i><\/div>/)
    expect(page).not.toContain('skewX')
    expect(page).not.toContain('mask-image')
    expect(page).toContain('.hud-overlay .tyre-slip__ticks { display: none; }')
    expect(page).toMatch(/\.tyre-slip__bar \.tyre-slip__fill \{[^}]*position: absolute;[^}]*background: var\(--tyre-slip-color\);/)
  })

  it('tints the tile more as the state worsens and never while waiting for data', async () => {
    const page = readFileSync(resolve(process.cwd(), 'app/pages/tyres-overlay.vue'), 'utf8')
    const alarm = (state: string) => Number(page.match(new RegExp(String.raw`tyre-slip--state-${state}[^{]*\{ --tyre-slip-alarm: (\d+)%`))?.[1])
    expect(alarm('limit')).toBeGreaterThan(0)
    expect(alarm('limit')).toBeLessThan(alarm('sliding'))
    expect(alarm('sliding')).toBeLessThan(alarm('wheelspin'))
    expect(alarm('wheelspin')).toBe(alarm('lockup'))
    expect(page).toContain('.hud-overlay .tyre-slip--waiting { --tyre-slip-alarm: 0%; }')
    const waiting = await renderToString(createSSRApp(TyreSlipHud, { fastState: { ...fastState(), isFresh: false } }))
    expect(waiting.match(/tyre-slip--waiting/g)).toHaveLength(4)
  })
})
