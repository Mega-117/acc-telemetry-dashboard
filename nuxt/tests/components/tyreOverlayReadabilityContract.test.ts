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
    expect(page).toContain('max(10px, calc(11px * var(--hud-scale)))')
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

    expect(race).toContain('max(34px,calc(48px * var(--hud-scale,1)))')
    expect(race).toContain('max(14px,calc(18px * var(--hud-scale,1)))')
    expect(race).toContain('max(11px,calc(12px * var(--hud-scale,1)))')
    expect(damage).toContain('max(22px,calc(30px * var(--hud-scale,1)))')
    expect(page).toContain('max(20px,calc(28px * var(--hud-scale)))')
  })
})
