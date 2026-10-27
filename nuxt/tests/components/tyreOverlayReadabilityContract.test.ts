import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8')
}

describe('tyre overlay minimum readability contract', () => {
  it('keeps essential slip values and labels above the minimum type floors', () => {
    const page = source('app/pages/tyres-overlay.vue')

    expect(page).toContain('max(16px, calc(18px * var(--hud-scale)))')
    expect(page).toContain('max(14px, calc(15px * var(--hud-scale)))')
    // HUD v2: pressure shares the slip row, so its floor rose from 10px to 12px.
    expect(page).toContain('max(12px, calc(14px * var(--hud-scale)))')
  })

  it('does not reintroduce sub-10px text at the compact tyres breakpoint', () => {
    const advanced = source('app/components/overlay/TyreAdvancedHud.vue')
    const setup = source('app/components/overlay/TyreSetupHud.vue')

    expect(advanced).toMatch(/\.tyre-advanced__brake-axle > small\s*\{[^}]*font-size:\s*10px;[^}]*\}/)
    expect(setup).toMatch(/\.tyre-setup__column h2\s*\{[^}]*font-size:\s*10px;[^}]*\}/)
    expect(setup).toMatch(/\.tyre-setup__start strong\s*\{[^}]*font-size:\s*10px;[^}]*\}/)
    expect(setup).toContain('font-size: max(10px, calc(8px * var(--hud-scale, 1)));')
  })

  it('keeps Race primary, secondary and status typography readable at scale 0.5', () => {
    const race = source('app/components/overlay/TyreRaceHud.vue')
    const damage = source('app/components/overlay/DamageRaceHud.vue')
    const page = source('app/pages/tyres-overlay.vue')

    // Third round (28/10): the viewBox comes from the geometry (166 x 195, see raceTyrePresentation).
    expect(race).toContain(':viewBox="`0 0 ${G.width} ${G.height}`"')
    // Fonts in SVG units: pressure 13, AVG word 11 with its number 12, loss 12, middle line 13,
    // tyre temperature 13 (shadow and stroke kept), brake values 12; status text keeps 18 units.
    expect(race).toContain('.tyre-race__primary { font-size:13px; }')
    expect(race).toContain('.tyre-race__average { fill:#c3c5cc; font-size:12px; }')
    expect(race).toContain('.tyre-race__average-label { font-size:11px; }')
    expect(race).toContain('.tyre-race__loss { fill:#ffa500; font-size:12px; }')
    expect(race).toContain('.tyre-race__compound text { font-size:13px;')
    expect(race).toMatch(/\.tyre-race__temperature \{ font-size:13px; paint-order:stroke; stroke:#000; stroke-width:1\.8px;[^}]*filter:drop-shadow/)
    expect(race).toContain('.tyre-race__brake-temp { font-size:12px; }')
    expect(race).toContain('.tyre-race__pad { fill:#c3c5cc; font-size:12px; }')
    expect(race).toContain('.tyre-race__unavailable text { font-size:18px; }')
    expect(damage).toContain('viewBox="0 0 166 241"')
    expect(damage).toContain('font-size:12px')
    expect(damage).toContain('font-size:10px')
    expect(page).toContain(':flash="raceDamageFlash"')
  })
})
