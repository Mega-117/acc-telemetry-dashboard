import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import DashboardHud from '~/components/overlay/DashboardHud.vue'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import { emptyTyreSetupViewModel } from '~/services/overlay/tyreSetupViewModel'
import type { DashboardAdjustableKey } from '~/utils/dashboardAdjustment'
import { buildDashboardPresentation, DEFAULT_DASHBOARD_OPTIONS } from '~/utils/dashboardPresentation'

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

const styles = () => source('app/assets/scss/components/dashboard-hud.scss')

function state(overrides: Partial<FastOverlayState> = {}): FastOverlayState {
  return {
    context: { track: 'monza', car: 'porsche_992_gt3_r', sessionType: 2, sessionIndex: 1, sessionUid: 's1', serverId: null },
    info: null, sectorHud: null, damage: null, pitPrediction: null, localDriver: null,
    flag: null, lapsCompleted: 0, currentLapTimeMs: null, lastLapTimeMs: null, bestLapTimeMs: null, lapValid: true,
    isFresh: true, isLive: true, ignitionOn: true, isEngineRunning: true, pitLimiterOn: false, isInPitLane: false,
    sessionType: 2, normalizedCarPosition: 0.4, speedKmh: 123.4, speedDeltaKmh: 3,
    referenceSpeedKmh: null, referenceRpm: null, referenceGear: null, referenceEngineMap: null,
    referenceTractionControl: null, referenceTractionControl2: null, referenceAbs: null,
    gas: 0.7, brake: 0.2, rpm: 7800, maxRpm: 12000, gear: 4,
    fuelL: 62, fuelPerLapL: 3, fuelLapsRemaining: 20.7, fuelLeftTimeMs: 2_174_000,
    sessionLapsRemaining: 8, sessionTimeLeftMs: 1000, engineMap: 3,
    tractionControl: 5, tractionControl2: 5, abs: 5, tractionControlInAction: false, absInAction: false, brakeBiasPct: 65,
    cornerSpeedKmh: 86, cornerSpeedDeltaKmh: 4, cornerSpeedMode: 'delta',
    directionLightsLeft: false, directionLightsRight: false, lightsStage: 2, rainLights: true,
    currentTyreSet: null, tyreSetAvailable: false, tyreCompound: null,
    rainIntensity: null, rainIntensity10Min: null, rainIntensity30Min: null,
    lapPressureAverage: { status: 'waiting_for_full_lap', lap: null, tyreSet: null, values: { FL: null, FR: null, RL: null, RR: null } },
    tyreSetup: emptyTyreSetupViewModel(), trackReferencePhase: null, trackReferencesEligible: false, tyres: [],
    ...overrides,
  }
}

async function render(
  overrides: Partial<FastOverlayState> = {},
  props: { backgroundOpacity?: number, adjusting?: DashboardAdjustableKey | null } = {},
  options = DEFAULT_DASHBOARD_OPTIONS,
): Promise<string> {
  const model = buildDashboardPresentation(state(overrides), options)
  return renderToString(createSSRApp(DashboardHud, { model, ...props }))
}

// Class list of the first element carrying `token` (SSR puts dynamic classes before static ones).
function classes(html: string, token: string): string[] {
  for (const match of html.matchAll(/class="([^"]*)"/g)) {
    const list = (match[1] ?? '').split(/\s+/)
    if (list.includes(token)) return list
  }
  return []
}

const cell = (html: string, id: string) => classes(html, `dash-cell--${id}`)

describe('Dashboard overlay window contract', () => {
  it('exposes a draggable Electron app region for HUD placement mode', () => {
    const page = source('app/pages/dashboard-overlay.vue')
    expect(page).toMatch(/\.overlay-root\{[^}]*-webkit-app-region:\s*drag[^}]*\}/s)
    expect(page).toMatch(/\.overlay-canvas\{[^}]*-webkit-app-region:\s*drag[^}]*\}/s)
  })

  it('does not expose manual shift flash controls or the removed speed delta on the HUD page', () => {
    const settings = source('app/pages/hud.vue')
    expect(settings).not.toContain('shiftFlashEnabled')
    expect(settings).not.toContain('shiftRpmThreshold')
    expect(settings).not.toContain('Lampeggio cambiata')
    expect(settings).not.toContain('Soglia lampeggio')
    expect(settings).not.toContain("t('hud.dashboard.speedDelta')")
  })
})

describe('Dashboard layout (PIP-671, approved draft "Cruscotto · race" 30/10)', () => {
  it('renders the RPM bar, four fuel boxes, the free gear with pedals and five electronics boxes in order', async () => {
    const html = await render()
    const labels = [...html.matchAll(/<span class="dash-cell__label"><b>([^<]*)<\/b><\/span>/g)].map(match => match[1])
    expect(labels).toEqual(['Fuel', 'Fuel / lap', 'Laps left', 'Fuel left', 'TC', 'TC2', 'ABS', 'MAP', 'BB · %'])
    // The gear has no frame or GEAR label; the pedal bars sit under it with their names.
    expect(html).toContain('<span>GAS</span>')
    expect(html).toContain('<span>BRK</span>')
    // No bottom row (draft): no Fuel Low / pit / autonomy line.
    expect(html).not.toMatch(/fuel-notice|Autonomia|prepara il pit/i)
    expect(classes(html, 'dash-rpm')).toEqual(expect.arrayContaining(['dash-rpm--green']))
    expect(html).toContain('class="dash-gear__value">4</strong>')
    expect(cell(html, 'bb')).toContain('dash-cell--wide')
    // Values use fixed-width digit slots, like the other v2/v3 HUDs.
    expect(html).toMatch(/class="dash-rpm__value"><span class="hud-fixed-digits" aria-label="7800"/)
    expect(html).toMatch(/aria-label="0:36:14"/)
  })

  it('removes Corner Speed, the speed tile with its delta and the headlight/rain lamps', async () => {
    const html = await render()
    for (const removed of ['>CS<', 'speed__', 'round-light', 'square-light', 'cs--', '>123<']) {
      expect(html).not.toContain(removed)
    }
  })

  it('uses the draft item colours on 3px frames and labels, upright Barlow values, both top corners cut', () => {
    const css = styles()
    const colours: Record<string, string> = {
      'fuel': '#1aa89f', 'fuel-lap': '#2398cd', 'laps': '#27a75c', 'fuel-left': '#a3b33a',
      'tc': '#cc941c', 'tc2': '#ce752b', 'abs': '#398de0', 'map': '#c4b52d', 'bb': '#b95c53',
    }
    for (const [id, colour] of Object.entries(colours)) expect(css).toContain(`.dash-cell--${id} { --c: ${colour}; }`)
    expect(css).toContain("@use '~/assets/scss/hud-cut-corner' as *;")
    expect(css).toContain("@include hud-cut-corner(14px, 14px, $hud-hairline-width, $hud-hairline-color, 'dash-hud--yellow-flag', $hud-flag-width);")
    expect(css).toMatch(/\.dash-cell \{[^}]*--w: 3px;/s)
    expect(css).toContain('.dash-cell__value { font: 700 35px/1 var(--hud-gauge-num); color: #f4f6f8; white-space: nowrap; }')
    expect(css).toMatch(/b \{[^}]*font: 700 15px\/1 var\(--hud-gauge-num\);[^}]*text-transform: uppercase;/s)
    expect(css).toMatch(/\.dash-hud \{[^}]*width: 700px;/s)
    expect(css).toContain('.dash-gear__value { font: 800 120px/1 var(--hud-gauge-num); color: #fff; }')
    // The bar has small cuts on both top corners, parallel to the panel's, a slanted fill end and no ticks.
    expect(css).toMatch(/\.dash-rpm \{[^}]*height: 42px;[^}]*clip-path: polygon\(6px 0, calc\(100% - 6px\) 0, 100% 6px, 100% 100%, 0 100%, 0 6px\);/s)
    expect(css).toMatch(/\.dash-rpm__fill \{[^}]*clip-path: polygon\(0 0, calc\(100% - 12px\) 0, 100% 100%, 0 100%\);/s)
    expect(css).not.toMatch(/\.[\w-]*tick[\w-]*\s*\{/)
  })

  it('highlights only the value being adjusted: white frame and label, REGOLA tag', async () => {
    const html = await render({}, { adjusting: 'bb' })
    expect(cell(html, 'bb')).toContain('dash-cell--on')
    expect(cell(html, 'tc')).not.toContain('dash-cell--on')
    expect(html).toMatch(/dash-cell--bb[^"]*"[^>]*>[\s\S]*?<small class="dash-cell__tag">REGOLA<\/small>/)
    expect(styles()).toMatch(/\.dash-cell--on \{[^}]*--c: #f4f6f8;[^}]*box-shadow: inset 0 0 0 1px #f4f6f8;/s)
  })
})

describe('Dashboard v3 states', () => {
  it('shift point: the whole bar turns blue and flashes in the draft blues (260 ms rhythm), SHIFT on the right', async () => {
    const html = await render({ context: { track: 'monza', car: 'ferrari_296_gt3', sessionType: 2, sessionIndex: 1, sessionUid: 's1', serverId: null }, rpm: 7400 })
    expect(classes(html, 'dash-rpm')).toEqual(expect.arrayContaining(['dash-rpm--blue', 'dash-rpm--flash']))
    expect(html).toContain('<span class="dash-rpm__shift-label">SHIFT</span>')
    expect(await render()).not.toContain('dash-rpm__shift-label')
    expect(styles()).toContain('.dash-rpm--flash .dash-rpm__fill { width: 100% !important; clip-path: none; animation: dash-shift-flash 260ms steps(1, end) infinite; }')
    expect(styles()).toContain('@keyframes dash-shift-flash { 0%, 49% { background: #0753d0; } 50%, 100% { background: #31b5ff; } }')
  })

  it('pit limiter: blue bar with PIT LIMITER ON, blue gear, pulsing bar', async () => {
    const html = await render({ pitLimiterOn: true })
    expect(classes(html, 'dash-rpm')).toEqual(expect.arrayContaining(['dash-rpm--pit', 'dash-rpm--pulse']))
    expect(html).toContain('PIT LIMITER ON')
    expect(classes(html, 'dash-center')).toContain('dash-gear--pit')
    expect(styles()).toContain('.dash-rpm--pit .dash-rpm__fill { width: 100% !important; clip-path: none; background: #0000ff; }')
    expect(styles()).toContain('.dash-gear--pit .dash-gear { background: #0000ff; }')
  })

  it('ignition and engine off: dark orange bar with the ACC Drive words, pulsing', async () => {
    const ignitionOff = await render({ ignitionOn: false, isEngineRunning: false })
    expect(classes(ignitionOff, 'dash-rpm')).toEqual(expect.arrayContaining(['dash-rpm--off', 'dash-rpm--pulse']))
    expect(ignitionOff).toContain('IGNITION OFF')
    expect(await render({ isEngineRunning: false })).toContain('ENGINE OFF')
    expect(styles()).toContain('.dash-rpm--off .dash-rpm__fill { width: 100% !important; clip-path: none; background: #4a2900; }')
    expect(styles()).toContain('.dash-rpm--pulse .dash-rpm__fill { animation: dash-rpm-pulse 0.5s ease-in-out infinite alternate; }')
  })

  it('TC and ABS fill only on a real intervention (amber / blue, ATTIVO tag); TC zero flashes a separate red frame', async () => {
    const active = await render({ tractionControlInAction: true, absInAction: true })
    expect(cell(active, 'tc')).toContain('dash-cell--active')
    expect(cell(active, 'abs')).toContain('dash-cell--active')
    expect(active.match(/<small class="dash-cell__tag">ATTIVO<\/small>/g)).toHaveLength(2)
    expect(await render()).not.toContain('dash-cell__tag')
    const zero = await render({ tractionControl: 0 })
    expect(cell(zero, 'tc')).toContain('dash-cell--off-warning')
    expect(cell(zero, 'tc')).not.toContain('dash-cell--active')
    const css = styles()
    expect(css).toContain('.dash-cell--tc.dash-cell--active { --fill: #efac10; --c: #ffd05a; }')
    expect(css).toContain('.dash-cell--abs.dash-cell--active { --fill: #179df3; --c: #7ed3ff; }')
    expect(css).toContain('.dash-cell--tc.dash-cell--off-warning { --c: #ff101b; }')
    expect(css).toMatch(/\.dash-cell--off-warning,[\s\S]*\{ animation: dash-tc-off-warning 1s linear infinite; \}/)
    expect(css).not.toMatch(/dash-cell--active[^}]*animation/)
  })

  it('fuel: one urgency on Fuel, Laps left and Fuel left in the draft caution look, text never fades', async () => {
    expect(await render({ fuelLapsRemaining: 2.5, fuelLeftTimeMs: 200_000 })).toContain('dash-hud--fuel-warning')
    expect(await render({ fuelLapsRemaining: 0.9 })).toContain('dash-hud--fuel-low')
    const critical = await render({ fuelLapsRemaining: 0.4 }, {}, { ...DEFAULT_DASHBOARD_OPTIONS, fuelCriticalFlashEnabled: true })
    expect(classes(critical, 'dash-hud')).toEqual(expect.arrayContaining(['dash-hud--fuel-low', 'dash-hud--fuel-critical-pulse']))
    const css = styles()
    expect(css).toMatch(/\.dash-hud--fuel-warning :is\(\.dash-cell--fuel, \.dash-cell--laps, \.dash-cell--fuel-left\) \{\s*--c: #\{\$dash-caution\};\s*background: \$dash-caution-bg;/)
    expect(css).toContain('$dash-caution: $hud-caution;')
    expect(css).toMatch(/\.dash-hud--fuel-low :is\(\.dash-cell--fuel, \.dash-cell--laps, \.dash-cell--fuel-left\) \{\s*--c: #ffae00;/)
    expect(css).toContain('animation: dash-fuel-critical-pulse 520ms steps(1, end) infinite;')
    expect(css).not.toMatch(/fuel-critical-pulse[^}]*opacity\s*:/)
  })

  it('yellow flag: 4px #ffd400 frame along the whole outline, both cuts included', async () => {
    expect(await render({ flag: 2 })).toContain('dash-hud--yellow-flag')
    expect(await render({ flag: 0 })).not.toContain('dash-hud--yellow-flag')
    expect(styles()).toContain("'dash-hud--yellow-flag', $hud-flag-width);")
  })

  it('direction lights blink the panel edges (ACC Drive tomato, 0.5 s)', async () => {
    const html = await render({ directionLightsLeft: true })
    expect(classes(html, 'dash-indicator--left')).toContain('is-active')
    expect(classes(html, 'dash-indicator--right')).not.toContain('is-active')
    expect(styles()).toContain('background: #ff6347;')
  })

  it('shows electronics and gear references only when enabled', async () => {
    const references = { referenceGear: 3, referenceTractionControl: 4 }
    expect(await render(references)).not.toContain('class="dash-ref"')
    const html = await render(references, {}, { ...DEFAULT_DASHBOARD_OPTIONS, electronicsReference: true, gearReference: true })
    expect(html).toContain('<small class="dash-ref">3</small>')
    expect(html).toContain('<small class="dash-ref">4</small>')
  })
})

describe('Dashboard v3 background transparency', () => {
  it('reaches only the HudOverlayBackground layer, opaque by default', async () => {
    const hud = source('app/components/overlay/DashboardHud.vue')
    const page = source('app/pages/dashboard-overlay.vue')
    expect(hud).toContain('<HudOverlayBackground :opacity="backgroundOpacity" />')
    expect(hud.match(/backgroundOpacity/g)).toHaveLength(3) // prop, default, the layer
    expect(hud).toContain('{ backgroundOpacity: 1, adjusting: null }')
    expect(page).toContain("const { backgroundOpacity } = useHudOverlayBackground(overlay.settings, 'dashboard')")
    expect(page).toContain(':background-opacity="backgroundOpacity"')
    expect(styles()).toMatch(/\.dash-hud \{[^}]*background: transparent;/s)
    expect(styles()).not.toContain('--hud-overlay-background-opacity')
    expect(await render({}, { backgroundOpacity: 0.3 })).toContain('--hud-overlay-background-opacity:0.3')
  })
})
