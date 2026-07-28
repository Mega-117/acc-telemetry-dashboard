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
    const layer = readFileSync(resolve(process.cwd(), 'app/components/overlay/HudOverlayBackground.vue'), 'utf8')
    const settingsPage = readFileSync(resolve(process.cwd(), 'app/pages/hud.vue'), 'utf8')

    expect(page).toContain(':background-opacity="backgroundOpacity"')
    expect(hud).toContain('<HudOverlayBackground :opacity="backgroundOpacity" />')
    expect(hud).toContain('background: transparent')
    expect(layer).toContain('background: rgba(0, 0, 0, var(--hud-overlay-background-opacity, .8))')
    expect(hud).not.toMatch(/\.info-hud\s*\{[^}]*\bopacity\s*:/s)
    expect(settingsPage).toContain('Trasparenza sfondo')
    expect(settingsPage).toContain('class="hud-slider"')
    expect(settingsPage).toContain('backgroundOpacity: backgroundTransparencyToOpacity(percentage)')
  })

  it('fills every Delta state from the left edge toward the right', () => {
    const hud = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoHud.vue'), 'utf8')

    expect(hud).toContain('class="info-delta__bar"')
    expect(hud).toContain("model.delta.side === 'zero' ? '0%' : `${model.delta.ratio * 100}%`")
    expect(hud).toMatch(/\.info-delta__bar i\s*\{[^}]*\bleft:\s*0;/s)
    expect(hud).toContain('.info-delta--negative .info-delta__bar i { background: #9acd32; }')
    expect(hud).toContain('.info-delta--positive .info-delta__bar i { background: #ef3038; }')
    expect(hud).toContain('.info-delta--purple .info-delta__bar i { background: #d000e8; }')
    expect(hud).not.toContain('grid-template-columns: 1fr 1fr')
    expect(hud).not.toContain('info-delta__half')
  })
})
