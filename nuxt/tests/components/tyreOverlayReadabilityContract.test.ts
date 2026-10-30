import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8')
}

describe('tyre overlay minimum readability contract', () => {
  it('keeps essential slip values and labels above the minimum type floors', () => {
    const page = source('app/pages/tyres-overlay.vue')

    // Classic aligned (HUD style guide 28/10): title 12, wheel id 16, values 20, state 13, units 11
    // at scale 1; the 0.6 minimum renders labels at 12px and values at 14px, units stay 11px.
    expect(page).toContain('max(12px, calc(12px * var(--hud-scale)))')
    expect(page).toContain('max(12px, calc(16px * var(--hud-scale)))')
    expect(page).toContain('max(14px, calc(20px * var(--hud-scale)))')
    expect(page).toContain('max(12px, calc(13px * var(--hud-scale)))')
    expect(page).toContain('max(11px, calc(11px * var(--hud-scale)))')
    expect(page).not.toMatch(/max\((10|11)px, calc\(1[2-3]px \* var\(--hud-scale\)\)\)/)
  })

  it('does not reintroduce sub-10px text at the compact tyres breakpoint', () => {
    const advanced = source('app/components/overlay/TyreAdvancedHud.vue')
    const setup = source('app/components/overlay/TyreSetupHud.vue')

    expect(advanced).toMatch(/\.tyre-advanced__brake-axle > small\s*\{[^}]*font-size:\s*10px;[^}]*\}/)
    expect(setup).toMatch(/\.tyre-setup__column h2\s*\{[^}]*font-size:\s*10px;[^}]*\}/)
    expect(setup).toMatch(/\.tyre-setup__start strong\s*\{[^}]*font-size:\s*10px;[^}]*\}/)
    expect(setup).toContain('font-size: max(10px, calc(8px * var(--hud-scale, 1)));')
  })

  it('PIP-671: Race keeps the draft type sizes at scale 1 and zooms as a whole, so 0.5 stays readable', () => {
    const race = source('app/components/overlay/TyreRaceHud.vue')
    const damage = source('app/components/overlay/DamageRaceHud.vue')
    const page = source('app/pages/tyres-overlay.vue')

    // Draft "Gomme" (30/10) at scale 1: pressure 31, AVG 24, loss 26, tyre temperature 26, axle brake
    // 30 and pad 24, middle line 24. The page zooms the whole Race window by the HUD scale, so at the
    // 0.5 minimum the smallest essential value (AVG) still renders at 12px.
    expect(race).toContain('.tyre-race__primary { font: 800 31px/1 var(--hud-gauge-num); }')
    expect(race).toContain('.tyre-race__average { color: #d4dce2; font: 700 24px/1.1 var(--hud-gauge-label); }')
    expect(race).toContain('.tyre-race__loss { color: #ffa500; font: 700 26px/1.1 var(--hud-gauge-num); }')
    expect(race).toContain('.tyre-race__temperature { color: #fff; font: 800 26px/1 var(--hud-gauge-num); }')
    expect(race).toMatch(/\.tyre-race__brake-temp \{[^}]*font: 700 30px\/1 var\(--hud-gauge-num\);/)
    expect(race).toMatch(/\.tyre-race__pad \{[^}]*font: 700 24px\/1 var\(--hud-gauge-num\);/)
    expect(race).toMatch(/\.tyre-race__compound-set \{[^}]*font: 700 24px\/30px var\(--hud-gauge-num\);/)
    expect(page).toMatch(/\.race-hud \{[^}]*zoom: var\(--hud-scale\);/)
    expect(page).toContain('width: calc(360px * var(--hud-scale));')
    expect(damage).toContain('viewBox="0 0 166 241"')
    expect(page).toContain(':flash="raceDamageFlash"')
  })
})
