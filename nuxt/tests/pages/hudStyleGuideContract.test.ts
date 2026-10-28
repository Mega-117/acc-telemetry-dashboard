import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { translate } from '~/i18n'
import { buildInfoPresentation } from '~/utils/infoPresentation'
import { buildDashboardPresentation } from '~/utils/dashboardPresentation'
import { normalizeFastState } from '~/services/telemetry/fastStateIngress'

// HUD style guide (owner 28/10, docs/wiki/frontend/2026-10-28-hud-guida-stile.md), checked across
// every in-game overlay in one place: yellow-flag frame, fixed-width digits on live values, and
// every interface text the overlays read by key exists in the dictionaries.
function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

const YELLOW = '#ffd400'

describe('yellow-flag frame: 4px #ffd400 on the outer edge of every overlay that has it', () => {
  it('Sectors (Classic and Compact) and Tyres (Classic and Race) draw it on the outer panel, scaled', () => {
    const sectorsPage = source('app/pages/sectors-overlay.vue')
    const sectorsStyles = source('app/assets/scss/components/sectors-overlay.scss')
    const tyresPage = source('app/pages/tyres-overlay.vue')
    expect(sectorsPage).toContain("'hud-overlay__panel--yellow-flag': fastState.flag === 2,")
    expect(tyresPage).toContain("'hud-overlay__panel--yellow-flag': displayFastState.flag === 2,")
    for (const styles of [sectorsStyles, tyresPage]) {
      expect(styles).toMatch(new RegExp(String.raw`\.hud-overlay__panel--yellow-flag::after \{[^}]*border: calc\(4px \* var\(--hud-scale\)\) solid ${YELLOW};[^}]*pointer-events: none;`))
    }
  })

  it('Info draws it above the content with the cut line thickened to the frame', () => {
    const info = source('app/components/overlay/InfoHud.vue')
    expect(info).toContain(":class=\"{ 'info-hud--yellow-flag': model.yellowFlagActive }\"")
    expect(info).toMatch(new RegExp(String.raw`\.info-hud--yellow-flag::after \{[^}]*inset: -1px;[^}]*border: 4px solid ${YELLOW};[^}]*pointer-events: none;`))
    expect(info).toContain(`.info-hud--yellow-flag > .info-hud__cut { height: 4px; background: ${YELLOW}; }`)
  })

  it('Dashboard draws the same frame through the shared cut-corner mixin', () => {
    const hud = source('app/components/overlay/DashboardHud.vue')
    const styles = source('app/assets/scss/components/dashboard-hud.scss')
    expect(hud).toContain("'dash-hud--yellow-flag': model.yellowFlagActive,")
    expect(styles).toContain("@include hud-cut-corner(14px, $dash-line, 'dash-hud--yellow-flag', 4px);")
    expect(styles).toMatch(new RegExp(String.raw`\.dash-hud--yellow-flag::after \{[^}]*border: 4px solid ${YELLOW};[^}]*pointer-events: none;`))
  })

  it('Info and Dashboard raise it only for the ACC yellow flag (2) of the shown car', () => {
    const state = (flag: number) => normalizeFastState({ ts: Date.now() / 1000, is_live: true, status: 2, flag })
    expect(buildDashboardPresentation(state(2)).yellowFlagActive).toBe(true)
    expect(buildDashboardPresentation(state(0)).yellowFlagActive).toBe(false)
    expect(buildDashboardPresentation(state(3)).yellowFlagActive).toBe(false)
    expect(buildInfoPresentation(state(2)).yellowFlagActive).toBe(true)
    expect(buildInfoPresentation(state(0)).yellowFlagActive).toBe(false)
  })
})

describe('fixed-width digits: live values never move (style guide rule 6)', () => {
  const cases: Array<[string, string[]]> = [
    ['app/components/overlay/DashboardHud.vue', [
      '<strong class="dash-rpm__value"><HudFixedDigits :value="model.ignitionLabel" /></strong>',
      '<strong class="dash-cell__value"><HudFixedDigits :value="cell.value" /></strong>',
    ]],
    ['app/components/overlay/InfoHud.vue', [
      '<strong><HudFixedDigits :value="model.delta.value" /></strong>',
      '<dd><HudFixedDigits :value="rowValue(row)" /></dd>',
    ]],
    ['app/components/overlay/SectorDeltaHud.vue', [
      '<HudFixedDigits :value="compactLapTime" />',
      '<HudFixedDigits :value="valueText(sector)" />',
      '<HudFixedDigits :value="deltaText(sector)" />',
      '<HudFixedDigits :value="formatDelta(lapDeltaMs ?? null)" />',
    ]],
    ['app/components/overlay/StandingsHud.vue', [
      '<HudFixedDigits :value="model.header.timeLeft" />',
      '<HudFixedDigits :value="row.relativeGap" />',
      "<HudFixedDigits :value=\"row.stintTime ?? '—'\" />",
    ]],
    ['app/components/overlay/TyreSlipHud.vue', [
      '<HudFixedDigits :value="formatSlip(tyre)" />',
      '<HudFixedDigits :value="tyre.pressurePsi.toFixed(1)" />',
    ]],
  ]

  it.each(cases)('%s wraps its live values in HudFixedDigits', (file, snippets) => {
    const text = source(file)
    expect(text).toContain("import HudFixedDigits from '~/components/overlay/HudFixedDigits.vue'")
    for (const snippet of snippets) expect(text).toContain(snippet)
  })

  it('Dashboard: every fuel and electronics box value goes through the fixed-digit cell', () => {
    // Both grids render with the same cell template, so no box can bypass the slots.
    const hud = source('app/components/overlay/DashboardHud.vue')
    expect(hud.match(/<strong class="dash-cell__value"><HudFixedDigits :value="cell\.value" \/><\/strong>/g)).toHaveLength(2)
    expect(hud).not.toMatch(/<strong class="dash-cell__value">\{\{/)
  })

  it('Race tyres (SVG text, no HTML slots) keep tabular figures centred on their anchor', () => {
    const race = source('app/components/overlay/TyreRaceHud.vue')
    expect(race).toMatch(/\.tyre-race \{[^}]*font-variant-numeric:tabular-nums;/)
    expect(race).toMatch(/\.tyre-race__matrix \{[^}]*text-anchor:middle;/)
  })
})

describe('overlay interface texts exist in the dictionaries (missing keys = 0)', () => {
  const files = [
    ...readdirSync(resolve(process.cwd(), 'app/components/overlay'))
      .filter(name => name.endsWith('.vue'))
      .map(name => `app/components/overlay/${name}`),
    ...readdirSync(resolve(process.cwd(), 'app/pages'))
      .filter(name => /-overlay\.vue$/.test(name) || name === 'hud.vue')
      .map(name => `app/pages/${name}`),
  ]

  it('every literal t(\'…\') key used by an overlay resolves in Italian and English', () => {
    const missing: string[] = []
    let checked = 0
    for (const file of files) {
      for (const match of source(file).matchAll(/\bt\(\s*'([\w.]+)'/g)) {
        const key = match[1]!
        checked += 1
        for (const locale of ['it', 'en'] as const) {
          if (translate(locale, key as never) === key) missing.push(`${locale} ${key} (${file})`)
        }
      }
    }
    // Guard against a silent scan: the overlays read well over a hundred keys.
    expect(checked).toBeGreaterThan(100)
    expect(missing).toEqual([])
  })
})
