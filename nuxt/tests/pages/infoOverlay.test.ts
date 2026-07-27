import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Info overlay window contract', () => {
  it('exposes a draggable Electron app region for HUD placement mode', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/pages/info-overlay.vue'), 'utf8')

    expect(source).toMatch(
      /\.overlay-root\{[^}]*-webkit-app-region:\s*drag[^}]*\}/s,
    )
    expect(source).toMatch(
      /\.overlay-canvas\{[^}]*-webkit-app-region:\s*drag[^}]*\}/s,
    )
  })

  it('applies the persisted alpha only to the black Info background', () => {
    const page = readFileSync(resolve(process.cwd(), 'app/pages/info-overlay.vue'), 'utf8')
    const hud = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoHud.vue'), 'utf8')
    const settingsPage = readFileSync(resolve(process.cwd(), 'app/pages/hud.vue'), 'utf8')

    expect(page).toContain(':background-opacity="backgroundOpacity"')
    expect(hud).toContain('background: rgba(0, 0, 0, var(--info-background-opacity, 0.8))')
    expect(hud).not.toMatch(/\.info-hud\s*\{[^}]*\bopacity\s*:/s)
    expect(settingsPage).toContain('Trasparenza sfondo')
    expect(settingsPage).toContain('class="hud-slider"')
    expect(settingsPage).toContain('backgroundOpacity: Math.round((1 - percentage / 100) * 100) / 100')
  })
})
