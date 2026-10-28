import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Owner rule (28/10): "Trasparenza sfondo" changes ONLY the panel background. Text, numbers, tile
// content, borders, icons and colour states always keep full opacity, so the setting must reach a
// background colour with alpha or a separate background layer, never `opacity` on a container.
function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

// CSS declarations only: the <style> blocks of a .vue file (whole file for .scss), comments removed.
function declarations(text: string): string[] {
  const blocks = text.includes('<style') ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n') : text
  const css = blocks.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
  return css.split(/[;{}]/).map(part => part.trim()).filter(Boolean)
}

// Every CSS declaration that reads the transparency variable must be a background colour.
function declarationsUsing(text: string, variable: string): string[] {
  return declarations(text).filter(part => part.includes(`var(${variable}`))
}

function opacityDeclarations(text: string): string[] {
  return declarations(text).filter(part => /^opacity\s*:/.test(part))
}

describe('HUD background transparency reaches only the background', () => {
  it('Sectors classic and compact: one rgba panel background, no opacity on the panel or its content', () => {
    const page = source('app/pages/sectors-overlay.vue')
    const styles = source('app/assets/scss/components/sectors-overlay.scss')
    const hud = source('app/components/overlay/SectorDeltaHud.vue')

    expect(page).toContain(":style=\"{ '--hud-sectors-bg-opacity': String(panelBackgroundOpacity) }\"")
    expect(declarationsUsing(styles, '--hud-sectors-bg-opacity')).toEqual([
      'background: rgba(13, 14, 18, var(--hud-sectors-bg-opacity, 1))',
    ])
    expect(declarationsUsing(hud, '--hud-sectors-bg-opacity')).toEqual([])
    expect(opacityDeclarations(styles)).toEqual([])
    expect(hud).not.toMatch(/backgroundOpacity|background-opacity/)
    expect(opacityDeclarations(hud).every(rule => !rule.includes('var('))).toBe(true)
  })

  it('Info and Standings: a separate background layer, the only element that reads the setting', () => {
    const layer = source('app/components/overlay/HudOverlayBackground.vue')
    expect(declarationsUsing(layer, '--hud-overlay-background-opacity')).toEqual([
      'background: rgba(0, 0, 0, var(--hud-overlay-background-opacity, .8))',
    ])
    expect(opacityDeclarations(layer)).toEqual([])

    for (const file of ['app/components/overlay/InfoHud.vue', 'app/components/overlay/StandingsHud.vue']) {
      const hud = source(file)
      expect(hud).toContain('<HudOverlayBackground :opacity="backgroundOpacity" />')
      expect(hud.match(/backgroundOpacity/g)).toHaveLength(2) // the prop and the layer
      // Fixed design opacities (e.g. the standings progress bar) never read the setting.
      expect(opacityDeclarations(hud).every(rule => !rule.includes('var('))).toBe(true)
    }
    for (const file of ['app/pages/info-overlay.vue', 'app/pages/standings-overlay.vue']) {
      const page = source(file)
      expect(page).toContain(':background-opacity="backgroundOpacity"')
      expect(opacityDeclarations(page)).toEqual([])
    }
  })

  it('Tyres classic and race: one rgba outer panel background, opaque by default, content untouched', () => {
    const page = source('app/pages/tyres-overlay.vue')
    const settings = source('app/pages/hud.vue')

    expect(page).toContain("const { backgroundOpacity } = useHudOverlayBackground(settings, 'tyres')")
    expect(page).toContain(":style=\"{ '--hud-tyres-bg-opacity': String(backgroundOpacity) }\"")
    // The panel (both variants) is the only rule reading the setting, and it is a background colour.
    expect(declarationsUsing(page, '--hud-tyres-bg-opacity')).toEqual([
      'background: rgba(13, 14, 18, var(--hud-tyres-bg-opacity, 1))',
    ])
    // Only the Race page switcher fades in on hover; it never reads the setting.
    expect(opacityDeclarations(page)).toEqual(['opacity:0', 'opacity:1'])
    // Classic tiles are content: their own light tint never reads the setting (style guide 28/10).
    expect(page).toMatch(/\.hud-overlay \.tyre-slip \{[^}]*background: color-mix\(in srgb, var\(--tyre-slip-color\) var\(--tyre-slip-alarm, 0%\), rgba\(255, 255, 255, 0\.045\)\);/)
    // Settings page: the shared slider is shown for Tyres too.
    expect(settings).toContain('v-if="supportsHudOverlayBackground(selectedOverlayId)"')
    expect(settings).not.toContain("selectedOverlayId !== 'tyres'")
  })

  it('Tyres race and Damage pages: no background of their own over the panel, content stays opaque', () => {
    const race = source('app/components/overlay/TyreRaceHud.vue')
    const weather = source('app/components/overlay/RaceWeatherHud.vue')
    const damage = source('app/components/overlay/DamageRaceHud.vue')

    // The old opaque SVG backdrop is gone: the outer panel shows through, values and rectangles do not change.
    expect(race).not.toContain('fill="#0d0e12"')
    expect(race).not.toMatch(/backgroundOpacity|--hud-tyres-bg-opacity/)
    expect(opacityDeclarations(race).every(rule => !rule.includes('var('))).toBe(true)
    // The weather strip has no background of its own; the cells keep their light tile.
    expect(weather).toMatch(/\.tyre-race__weather \{[^}]*background:transparent;/)
    expect(weather).toContain('background:rgba(255,255,255,0.045)')
    expect(weather).not.toContain('#0d0e12')
    // Damage: only the backdrop shade fades with the panel, never the car drawing or the values.
    expect(damage).toContain('<rect class="damage-race__background" width="166" height="241" fill="#000" />')
    expect(declarationsUsing(damage, '--hud-tyres-bg-opacity')).toEqual([
      'fill-opacity:calc(.65 * var(--hud-tyres-bg-opacity, 1))',
    ])
    expect(opacityDeclarations(damage).every(rule => !rule.includes('var('))).toBe(true)
  })
})

describe('Dashboard v3 background transparency (owner 28/10)', () => {
  it('reaches only the shared background layer; the panel, frames and values keep full opacity', () => {
    const page = source('app/pages/dashboard-overlay.vue')
    const hud = source('app/components/overlay/DashboardHud.vue')
    const styles = source('app/assets/scss/components/dashboard-hud.scss')

    expect(page).toContain("const { backgroundOpacity } = useHudOverlayBackground(overlay.settings, 'dashboard')")
    expect(page).toContain(':background-opacity="backgroundOpacity"')
    expect(opacityDeclarations(page)).toEqual([])
    expect(hud).toContain('<HudOverlayBackground :opacity="backgroundOpacity" />')
    // The prop, its default and the layer: no other element reads the setting.
    expect(hud.match(/backgroundOpacity/g)).toHaveLength(3)
    // The panel itself is transparent; the background layer is the only fill behind the content.
    expect(styles).toMatch(/\.dash-hud \{[^}]*background: transparent;/)
    expect(declarationsUsing(styles, '--hud-overlay-background-opacity')).toEqual([])
    expect(styles).not.toMatch(/backgroundOpacity|background-opacity/)
    // Fixed design opacities (RPM markers, indicator fade, pulse keyframes) never read a variable.
    expect(opacityDeclarations(styles).every(rule => !rule.includes('var('))).toBe(true)
  })

  it('the map has no transparency setting: the Track Map page never reads it', () => {
    const page = source('app/pages/trackmap-overlay.vue')
    expect(page).not.toMatch(/useHudOverlayBackground|HudOverlayBackground|background-opacity/)
  })
})

describe('Sectors yellow-flag frame (owner 28/10)', () => {
  it('draws the tyres frame, 4px scaled, on the whole panel for Classic and Compact', () => {
    const page = source('app/pages/sectors-overlay.vue')
    const styles = source('app/assets/scss/components/sectors-overlay.scss')

    expect(page).toContain("'hud-overlay__panel--yellow-flag': fastState.flag === 2,")
    expect(styles).toMatch(/\.hud-overlay__panel--yellow-flag::after \{[^}]*position: absolute;[^}]*inset: 0;[^}]*border: calc\(4px \* var\(--hud-scale\)\) solid #ffd400;[^}]*pointer-events: none;/)
  })
})
