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

// The "AVG" word is its own smaller tspan (third round 28/10); read the line as the pilot does.
async function renderRace(state: unknown) {
  const html = await renderToString(createSSRApp(TyreRaceHud, { fastState: state }))
  return html.replace(/<tspan class="tyre-race__average-label"[^>]*>AVG <\/tspan>/g, 'AVG ')
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
    expect(race).toContain('fill="#6b7280"')
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
    // Third round (28/10): the viewBox is only as tall as the content.
    expect(html).toContain('viewBox="0 0 166 195"')
    // The AVG word is smaller than its number: its own tspan inside the 12-unit line.
    const raw = await renderToString(createSSRApp(TyreRaceHud, { fastState: fastState() }))
    expect(raw.match(/<tspan class="tyre-race__average-label"[^>]*>AVG <\/tspan>23\.1/g)).toHaveLength(4)
  })

  it('third round: the yellow flag no longer draws a frame inside the tyres panel', async () => {
    const html = await renderRace({ ...fastState(), flag: 2 })
    expect(html).not.toContain('#ffd400')
    // The frame is on the whole outer panel (weather strip included) for Classic and Race,
    // tyres and Damage pages alike; the Damage component itself is unchanged.
    const page = readFileSync(resolve(process.cwd(), 'app/pages/tyres-overlay.vue'), 'utf8')
    expect(page).toMatch(/class="hud-overlay__panel"\s*:class="\{[^}]*'hud-overlay__panel--yellow-flag': displayFastState\.flag === 2,/)
    // About 4px at scale 1, scaling with the HUD; an overlay above the content, so no layout shift.
    const frame = page.match(/\.hud-overlay__panel--yellow-flag::after \{([^}]*)\}/)?.[1] ?? ''
    expect(frame).toContain('border: calc(4px * var(--hud-scale)) solid #ffd400;')
    expect(frame).toContain('position: absolute;')
    expect(frame).toContain('inset: 0;')
    expect(frame).toContain('pointer-events: none;')
    expect(page).not.toContain('race-hud--yellow-flag')
    const damage = await renderToString(createSSRApp(DamageRaceHud, { fastState: { ...fastState(), flag: 2 } }))
    expect(damage).toContain('stroke="#ffd400"')
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

  it('motore spento e limiter coesistono, centrati sugli assi; un solo valore freno per asse', async () => {
    const state = { ...fastState(), isEngineRunning: false, pitLimiterOn: true }
    const html = await renderRace(state)
    expect(html).toContain('tyre-race__engine-off')
    expect(html).toContain('tyre-race__limiter')
    // Square boxes centred on the axles: front centre 65, rear centre 131 (box 48 tall).
    expect(html).toMatch(/tyre-race__engine-off[^>]*><rect x="43" y="41" width="80" height="48"/)
    expect(html).toMatch(/tyre-race__limiter[^>]*><rect x="43" y="107" width="80" height="48"/)
    expect(html).not.toMatch(/tyre-race__(engine-off|limiter)[^>]*><rect[^>]*rx=/)
    // Third round (28/10), like ACC Drive: one averaged reading per axle, centred between the brakes.
    expect(html.match(/tyre-race__brake-temp/g)).toHaveLength(2)
    for (const [axle, temp, pad] of [['front', 563, 92], ['rear', 543, 90]] as const) {
      const block = html.slice(html.indexOf(`tyre-race__axle-brake--${axle}`))
      expect(block).toMatch(new RegExp(`text-anchor="middle"[^>]*><text x="83"[^>]*class="tyre-race__brake-temp"[^>]*>${temp}\u00b0<[\\s\\S]*?tyre-race__pad[^>]*>${pad}%<`))
    }
    for (const value of ['568\u00b0', '558\u00b0', '548\u00b0', '538\u00b0']) expect(html).not.toContain(value)
    // Each brake keeps its own colour rectangle.
    expect(html.match(/<rect class="[^"]*tyre-race__brake--(front|rear)[^"]*"[^>]*fill="/g)).toHaveLength(4)
    // The Damage page keeps its boxes where they were.
    const damage = await renderToString(createSSRApp(DamageRaceHud, { fastState: state }))
    expect(damage).toMatch(/tyre-race__engine-off[^>]*><rect x="43" y="40" width="80" height="48"/)
    expect(damage).toMatch(/tyre-race__limiter[^>]*><rect x="43" y="152" width="80" height="48"/)
  })

  it('HUD v2: front values read pressure, AVG, loss; rear values loss, AVG, pressure', async () => {
    const html = await renderRace(fastState())
    const kinds = (id: string) => {
      const start = html.indexOf(`tyre-race__corner--${id}`)
      const values = html.slice(start, html.indexOf('</g>', start))
      return [...values.matchAll(/class="tyre-race__(primary|average|loss)" x="[\d.]+" y="([\d.]+)"/g)]
        .sort((a, b) => Number(a[2]) - Number(b[2])).map(match => match[1])
    }
    for (const id of ['fl', 'fr']) expect(kinds(id)).toEqual(['primary', 'average', 'loss'])
    for (const id of ['rl', 'rr']) expect(kinds(id)).toEqual(['loss', 'average', 'primary'])
  })

  it('third round: damage is the total repair time in the middle line, only when damaged', async () => {
    const damaged = await renderRace(fastState())
    // "DRY · SET 2 · DANNI 0:37.9": the damage part in red, the line fitted to the panel.
    const line = damaged.slice(damaged.indexOf('<g class="tyre-race__compound"'), damaged.indexOf('</g>', damaged.indexOf('<g class="tyre-race__compound"')))
    expect(line).toMatch(/DRY · SET 2(<!--\[-->)? · <tspan class="tyre-race__damage"[^>]*>DANNI 0:37\.9<\/tspan>/)
    expect(line).toContain('textLength="156"')
    expect(line).toContain('lengthAdjust="spacingAndGlyphs"')
    // No separate damage section any more.
    for (const value of ['Carrozz.', 'Sospens.', 'Totale', '0:16.980', '0:21.000']) expect(damaged).not.toContain(value)
    expect(damaged.match(/tyre-race__damage/g)).toHaveLength(1)
    const healthy = fastState()
    healthy.damage = {
      body: { front: { percentage: 0, repairTimeMs: 0 }, rear: { percentage: 0, repairTimeMs: 0 }, left: { percentage: 0, repairTimeMs: 0 }, right: { percentage: 0, repairTimeMs: 0 }, repairTimeMs: 0 },
      suspension: { FL: { percentage: 0 }, FR: { percentage: 0 }, RL: { percentage: 0 }, RR: { percentage: 0 }, repairTimeMs: 0 },
      totalRepairTimeMs: 0,
    }
    const clean = await renderRace(healthy)
    expect(clean).not.toContain('tyre-race__damage')
    expect(clean).not.toContain('DANNI')
    expect(clean).not.toContain('textLength')
    expect(clean).toMatch(/>DRY · SET 2(<!--\]-->|<!---->)?<\/text>/)
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
    // Axle brake: the front averages only the side that exists, the rear has none.
    const front = html.slice(html.indexOf('tyre-race__axle-brake--front'))
    expect(front).toMatch(/tyre-race__brake-temp[^>]*>568°<[\s\S]*?tyre-race__pad[^>]*>92%</)
    const rear = html.slice(html.indexOf('tyre-race__axle-brake--rear'))
    expect(rear).toMatch(/tyre-race__brake-temp[^>]*>--°<[\s\S]*?tyre-race__pad[^>]*>--%</)
  })
})

describe('HUD style v2 (27/10) classic tyres', () => {
  it('drops the speed from the header and keeps id, state, bar, slip and psi per card', async () => {
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

  it('classic v2 (28/10): square state tag, cut corner with its border, id in the numbers font', async () => {
    const page = readFileSync(resolve(process.cwd(), 'app/pages/tyres-overlay.vue'), 'utf8')
    const html = await renderToString(createSSRApp(TyreSlipHud, { fastState: fastState() }))
    // The state tag is square (no pill) and filled with the slip colour.
    expect(page).toMatch(/\.tyre-slip__state,[\s\S]*?\{[^}]*border-radius:\s*0;[^}]*background:\s*var\(--tyre-slip-color/)
    expect(page).not.toContain('border-radius: 999px')
    expect(html.match(/<span class="tyre-slip__state">OK<\/span>/g)).toHaveLength(4)
    // Cut top-right corner, and the diagonal line that draws the border back on the cut.
    expect(page).toMatch(/\.hud-overlay \.tyre-slip \{[^}]*clip-path: polygon\(0 0, calc\(100% - var\(--tyre-slip-cut\)\) 0, 100% var\(--tyre-slip-cut\)/)
    expect(html.match(/<i class="tyre-slip__cut" aria-hidden="true"><\/i>/g)).toHaveLength(4)
    expect(page).toMatch(/\.tyre-slip__cut \{[^}]*width: calc\(var\(--tyre-slip-cut\) \* 1\.4142\);[^}]*background: var\(--tyre-slip-line\);[^}]*transform: rotate\(45deg\)/)
    // Owner (28/10): square outer panel with an even scaled margin; cards fill the width; yellow frame kept.
    expect(page).toMatch(/\.hud-overlay__panel \{[^}]*padding: calc\(12px \* var\(--hud-scale\)\);[^}]*border-radius: 0;/)
    expect(page).toMatch(/\.tyre-slip-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/)
    expect(page).toMatch(/\.hud-overlay__panel--yellow-flag::after \{[^}]*border: calc\(4px \* var\(--hud-scale\)\) solid #ffd400;[^}]*border-radius: inherit;/)
    // Readability at the 0.6 minimum: tags and units never below 12px, values 14px, id 16px.
    expect(page).toMatch(/\.tyre-slip__meta small \{[^}]*color: #d0d2d8;[^}]*font: 700 max\(12px, calc\(13px \* var\(--hud-scale\)\)\)/)
    expect(page).toMatch(/\.tyre-slip__state,[\s\S]*?\{[^}]*font: 700 max\(12px, calc\(13px \* var\(--hud-scale\)\)\)/)
    // Slip-colour band on the left edge.
    expect(page).toMatch(/\.hud-overlay \.tyre-slip::before \{[^}]*left: 0;[^}]*background: var\(--tyre-slip-color\)/)
    expect(page).toMatch(/\.tyre-slip__topline strong \{[^}]*font: italic 700 [^;]*var\(--hud-font-num\)/)
  })

  it('classic v2 (28/10): ten slanted ticks over ONE continuous fill sized by the slip formula', async () => {
    const page = readFileSync(resolve(process.cwd(), 'app/pages/tyres-overlay.vue'), 'utf8')
    const state = fastState()
    const html = await renderToString(createSSRApp(TyreSlipHud, { fastState: state }))
    // wheelSlipScaled 3, 6, 9, 12 → 3/18, 6/18 ... of the bar: a continuous width, not whole ticks.
    const widths = [...html.matchAll(/class="tyre-slip__fill" style="width:([\d.]+)%;"/g)].map(match => Number(match[1]))
    expect(widths).toHaveLength(4)
    widths.forEach((width, index) => expect(width).toBeCloseTo(((3 + index * 3) / 18) * 100, 5))
    expect(widths[0]! % 10).not.toBe(0)
    // One fill per gauge, inside the masked track, under ten tick outlines.
    expect(html.match(/class="tyre-slip__fill"/g)).toHaveLength(4)
    expect(html.match(/class="tyre-slip__tick"/g)).toHaveLength(40)
    expect(html).toMatch(/<span class="tyre-slip__track"><span class="tyre-slip__fill"[^>]*><\/span><\/span><!--\[--><i class="tyre-slip__tick">/)
    expect(page).toMatch(/\.tyre-slip__bar \{[^}]*transform: skewX\(-18deg\)/)
    expect(page).toMatch(/\.tyre-slip__track \{[^}]*mask-image: repeating-linear-gradient\(90deg, #000 0 calc\(10% - var\(--tyre-slip-tick-gap\)\), transparent calc\(10% - var\(--tyre-slip-tick-gap\)\) 10%\)/)
    expect(page).toMatch(/\.tyre-slip__tick \{[^}]*flex: 0 0 calc\(10% - var\(--tyre-slip-tick-gap\)\);[^}]*margin-right: var\(--tyre-slip-tick-gap\);/)
  })

  it('tints the card more as the state worsens and never while waiting for data', async () => {
    const page = readFileSync(resolve(process.cwd(), 'app/pages/tyres-overlay.vue'), 'utf8')
    const alarm = (state: string) => Number(page.match(new RegExp(String.raw`tyre-slip--state-${state}[^{]*\{ --tyre-slip-alarm: (\d+)%`))?.[1])
    expect(alarm('limit')).toBeLessThan(alarm('sliding'))
    expect(alarm('sliding')).toBeLessThan(alarm('wheelspin'))
    expect(alarm('wheelspin')).toBe(alarm('lockup'))
    expect(page).toContain('.hud-overlay .tyre-slip--waiting { --tyre-slip-alarm: 0%; }')
    expect(page).toContain('.hud-overlay .tyre-slip--waiting::before { background: rgba(255, 255, 255, 0.22); }')
    const waiting = await renderToString(createSSRApp(TyreSlipHud, { fastState: { ...fastState(), isFresh: false } }))
    expect(waiting.match(/tyre-slip--waiting/g)).toHaveLength(4)
  })
})
