import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Dashboard overlay window contract', () => {
  it('exposes a draggable Electron app region for HUD placement mode', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/pages/dashboard-overlay.vue'), 'utf8')

    expect(source).toMatch(
      /\.overlay-root\{[^}]*-webkit-app-region:\s*drag[^}]*\}/s,
    )
    expect(source).toMatch(
      /\.overlay-canvas\{[^}]*-webkit-app-region:\s*drag[^}]*\}/s,
    )
  })

  it('shares one low-fuel warning across the three fuel tiles without hiding text', () => {
    const component = readFileSync(resolve(process.cwd(), 'app/components/overlay/DashboardHud.vue'), 'utf8')

    expect(component).toContain("'dashboard--fuel-low': model.fuelUrgency !== 'normal'")
    expect(component).toContain("'dashboard--fuel-critical-pulse': model.fuelCriticalPulse")
    expect(component).toMatch(
      /\.dashboard--running\.dashboard--fuel-low \.fuel,[\s\S]*\.laps,[\s\S]*\.fuel-left\{border-color:#ffae00;color:#ffae00\}/,
    )
    expect(component).toMatch(
      /\.dashboard--fuel-critical-pulse \.fuel,[\s\S]*\.laps,[\s\S]*\.fuel-left\{animation:fuel-critical-pulse/,
    )
    expect(component).not.toMatch(/fuel-critical-pulse[^}]*opacity\s*:/)
  })
  it('does not expose manual shift flash controls on the HUD page', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/pages/hud.vue'), 'utf8')

    expect(source).not.toContain('shiftFlashEnabled')
    expect(source).not.toContain('shiftRpmThreshold')
    expect(source).not.toContain('Lampeggio cambiata')
    expect(source).not.toContain('Soglia lampeggio')
  })

})
