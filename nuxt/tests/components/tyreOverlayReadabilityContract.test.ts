import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8')
}

describe('tyre overlay minimum readability contract', () => {
  it('keeps essential slip values and labels above the minimum type floors', () => {
    const page = source('app/pages/tyres-overlay.vue')

    // Classic aligned (HUD style guide 28/10, no title bar since 30/10): wheel id 16, values 20, state 13,
    // units 11 at scale 1; the 0.6 minimum renders labels at 12px and values at 14px, units stay 11px.
    expect(page).toContain('max(12px, calc(16px * var(--hud-scale)))')
    expect(page).toContain('max(14px, calc(20px * var(--hud-scale)))')
    expect(page).toContain('max(12px, calc(13px * var(--hud-scale)))')
    expect(page).toContain('max(11px, calc(11px * var(--hud-scale)))')
    expect(page).not.toMatch(/max\((10|11)px, calc\(1[2-3]px \* var\(--hud-scale\)\)\)/)
  })


  it('PIP-671: Race keeps the draft type sizes at scale 1 and zooms as a whole, so 0.5 stays readable', () => {
    const race = source('app/components/overlay/TyreRaceHud.vue')
    const damage = source('app/components/overlay/DamageRaceHud.vue')
    const page = source('app/pages/tyres-overlay.vue')

    // Owner (30/10), bigger than the draft at scale 1: pressure 36, AVG 27, loss 29, tyre temperature 34,
    // axle brake 34 and pad 30, middle line 28. The page zooms the whole Race window by the HUD scale,
    // so at the 0.5 minimum the smallest essential value (AVG) still renders at 13.5px.
    expect(race).toContain('.tyre-race__primary { font: 800 36px/1 var(--hud-gauge-num); }')
    expect(race).toContain('.tyre-race__average { color: #d4dce2; font: 700 27px/1.1 var(--hud-gauge-label); }')
    expect(race).toContain('.tyre-race__loss { color: #ffa500; font: 700 29px/1.1 var(--hud-gauge-num); }')
    expect(race).toContain('.tyre-race__temperature { color: #fff; font: 800 34px/1 var(--hud-gauge-num); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.7); white-space: nowrap; --hud-glyph-digit: 0.62em; }')
    expect(race).toMatch(/\.tyre-race__brake-temp \{[^}]*font: 700 34px\/1 var\(--hud-gauge-num\);/)
    expect(race).toMatch(/\.tyre-race__pad \{[^}]*font: 700 30px\/1 var\(--hud-gauge-num\);/)
    expect(race).toMatch(/\.tyre-race__compound-set \{[^}]*font: 700 28px\/34px var\(--hud-gauge-num\);/)
    expect(page).toMatch(/\.race-hud \{[^}]*zoom: var\(--hud-scale\);/)
    expect(page).toContain('width: round(calc(404px * var(--hud-scale)), 1px);')
    expect(damage).toContain('viewBox="0 0 166 241"')
    expect(page).toContain(':flash="raceDamageFlash"')
  })
})
