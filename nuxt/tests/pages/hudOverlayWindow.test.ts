import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeHudRightGutter } from '../../app/utils/hudOverlayWindow'

describe('Shared HUD overlay window contract', () => {
  it('normalizes the runtime gutter without inventing a frontend default', () => {
    expect(normalizeHudRightGutter('8')).toBe(8)
    expect(normalizeHudRightGutter(['12', '4'])).toBe(12)
    expect(normalizeHudRightGutter('7.6')).toBe(8)
    expect(normalizeHudRightGutter('-4')).toBe(0)
    expect(normalizeHudRightGutter('120')).toBe(64)
    expect(normalizeHudRightGutter(undefined)).toBe(0)
    expect(normalizeHudRightGutter('invalid')).toBe(0)
  })

  it('routes every registered HUD through the shared safe-area layout', () => {
    const app = readFileSync(resolve(process.cwd(), 'app/app.vue'), 'utf8')
    const routeBlock = app.match(/const hudOverlayRoutes = \[([^\]]+)\]/s)?.[1] || ''
    const routes = Array.from(routeBlock.matchAll(/'\/(.+?-overlay)'/g), match => match[1])

    expect(routes).toEqual([
      'tyres-overlay',
      'sectors-overlay',
      'dashboard-overlay',
      'info-overlay',
      'standings-overlay',
    ])

    for (const route of routes) {
      const page = readFileSync(resolve(process.cwd(), `app/pages/${route}.vue`), 'utf8')
      expect(page, route).toContain("definePageMeta({ layout: 'hud-overlay' })")
    }
  })

  it('keeps fluid HUD pages inside the content area instead of the full window', () => {
    for (const route of ['tyres-overlay', 'sectors-overlay']) {
      const page = readFileSync(resolve(process.cwd(), `app/pages/${route}.vue`), 'utf8')
      expect(page, route).toMatch(/\.hud-overlay\s*\{[^}]*position:\s*absolute;/s)
      expect(page, route).not.toMatch(/\.hud-overlay\s*\{[^}]*position:\s*fixed;/s)
    }
  })

  it('reserves the runtime gutter outside the visual content canvas', () => {
    const layout = readFileSync(resolve(process.cwd(), 'app/layouts/hud-overlay.vue'), 'utf8')

    expect(layout).toContain('normalizeHudRightGutter(route.query.rightGutter)')
    expect(layout).toMatch(/\.hud-overlay-window\s*\{[^}]*box-sizing:\s*border-box;/s)
    expect(layout).toContain('padding-right: var(--hud-overlay-right-gutter, 0)')
    expect(layout).toMatch(/\.hud-overlay-window__content\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s)
  })
})
