import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import InfoHud from '~/components/overlay/InfoHud.vue'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import { buildInfoPresentation, DEFAULT_INFO_OPTIONS, type InfoOptions } from '~/utils/infoPresentation'

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
    expect(settingsPage).toContain("t('hud.backgroundTransparency')")
    expect(settingsPage).toContain('class="hud-slider"')
    expect(settingsPage).toContain('backgroundOpacity: backgroundTransparencyToOpacity(percentage)')
  })

  it('adatta pannello e BrowserWindow alle sole righe visibili senza cambiare larghezza', () => {
    const page = readFileSync(resolve(process.cwd(), 'app/pages/info-overlay.vue'), 'utf8')
    const hud = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoHud.vue'), 'utf8')
    // PIP-671: the approved draft is 300px wide.
    expect(hud).toMatch(/\.info-hud\s*\{[^}]*width:\s*300px;[^}]*height:\s*auto;/s)
    expect(hud).not.toContain('height: 512px')
    expect(page).toContain("api.hudOverlaySetSize('info'")
    expect(page).toContain('api.overlayRegionId ? canvas.parentElement?.clientWidth || rect.width : window.innerWidth')
    expect(page).toContain('height: Math.ceil(rect.height)')
    expect(page).toContain("'--hud-scale': String(overlay.scale.value)")
    expect(page).toContain('new ResizeObserver')
  })

  it('Delta fill grows from a white centre line (draft colours)', () => {
    const hud = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoHud.vue'), 'utf8')

    expect(hud).toContain('class="info-delta__bar"')
    expect(hud).toContain(':style="infoDeltaFillStyle(model.delta)"')
    expect(hud).toMatch(/\.info-delta__bar::after\s*\{[^}]*left:\s*50%;[^}]*width:\s*2px;[^}]*background:\s*#fff;/s)
    expect(hud).toContain('.info-delta--negative .info-delta__bar i { background: #9acd32; }')
    expect(hud).toContain('.info-delta--positive .info-delta__bar i { background: #ef4444; }')
    expect(hud).toContain('.info-delta--purple .info-delta__bar i { background: #b600b6; }')
    expect(hud).not.toContain('info-delta__half')
  })

  it('PIP-671: only the top-right corner is cut, draft type sizes with the 0.6 floors', () => {
    const hud = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoHud.vue'), 'utf8')

    // Owner: bottom-left is a normal square corner; the shared outline draws the hairline frame.
    expect(hud).toContain("@include hud-cut-corner(0px, 14px, $hud-hairline-width, $hud-hairline-color, 'info-hud--yellow-flag', $hud-flag-width);")
    expect(hud).not.toContain('info-hud__cut')
    // Labels 20px, values 27px at scale 1; floors are rendered px divided by the canvas scale.
    expect(hud).toMatch(/\.info-row dt\s*\{[^}]*color:\s*#c5ced7;[^}]*font:\s*700 max\(20px, calc\(12px \/ var\(--hud-scale, 1\)\)\)\/1\.2 var\(--hud-gauge-num\);[^}]*text-transform:\s*uppercase;/s)
    expect(hud).toMatch(/\.info-row dd\s*\{[^}]*font:\s*700 max\(27px, calc\(14px \/ var\(--hud-scale, 1\)\)\)/s)
    expect(hud).toMatch(/\.info-delta strong\s*\{[^}]*font:\s*800 48px\/1 var\(--hud-gauge-num\);/s)
    expect(hud).not.toMatch(/#ff0024|info-hud__accent/)
  })

  it('yellow flag: the 4px frame follows the whole outline, the cut included; warnings use the caution band', () => {
    const hud = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoHud.vue'), 'utf8')

    expect(hud).toContain(":class=\"{ 'info-hud--yellow-flag': model.yellowFlagActive }\"")
    expect(hud).toContain("'info-row--caution': row.caution")
    expect(hud).toContain('border-left: 3px solid var(--caution);')
    expect(hud).toContain('background: $hud-caution-bg;')
  })

  it('background transparency reaches only the background layer, never the content', () => {
    const hud = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoHud.vue'), 'utf8')
    const page = readFileSync(resolve(process.cwd(), 'app/pages/info-overlay.vue'), 'utf8')

    expect(hud.match(/backgroundOpacity/g)).toHaveLength(2) // the prop and the background layer
    expect(hud).not.toMatch(/(^|[\s;{])opacity\s*:/m)
    expect(page).not.toMatch(/(^|[\s;{])opacity\s*:/m)
  })

  it('renders every enabled row with its tone, fixed digits, caution rows and the opacity layer', async () => {
    const model = buildInfoPresentation({
      flag: 2,
      sessionType: 2,
      info: {
        delta: { ms: 245, available: true, side: 'positive', ratio: 0.4, purple: false },
        stintTimeLeftMs: 1_530_000, fuelLabel: 'Q-Fuel', fuelNeededL: -1.8, fuelLeftTimeMs: 3_930_000,
        fuelLeftReferenceLapMs: 90_000, incidents: 2, grip: 'Optimum', pitExitTraffic: 0,
        optimalLapTimeMs: 103_260, bestLapTimeMs: 103_362, damageTimeMs: 12_400,
      },
    } as unknown as FastOverlayState, Object.fromEntries(Object.keys(DEFAULT_INFO_OPTIONS).map(key => [key, true])) as unknown as InfoOptions)
    const html = await renderToString(createSSRApp(InfoHud, { model, localTimeValue: '14:32:05', backgroundOpacity: 0.35 }))

    const labels = [...html.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map(match => match[1])
    expect(labels).toEqual(['Stint', 'Q-Fuel', 'Fuel Left', 'Incidents', 'Grip', 'Pit Exit', 'Optimal', 'Best', 'Damage', 'Time'])
    expect(html).toContain('info-row--green')
    expect(html).toContain('info-row--purple')
    expect(html).toContain('class="hud-fixed-digits" aria-label="+0.245"')
    expect(html).toContain('class="hud-fixed-digits" aria-label="25:30"')
    expect(html).toContain('class="hud-fixed-digits" aria-label="14:32:05"')
    expect(html).toContain('>Optimum<')
    expect(html).toContain('style="left:50%;right:auto;width:20%;"')
    expect(html).toContain('--hud-overlay-background-opacity:0.35;')
    // Damage above zero is the only warning in this model: one caution row.
    expect(html.match(/info-row--caution/g)).toHaveLength(1)
    expect(html).toMatch(/info-row--caution[^>]*>\s*<dt[^>]*>Damage</)
    expect(html).toContain('info-hud--yellow-flag')

    const fewer = buildInfoPresentation({ info: null } as unknown as FastOverlayState, {
      ...DEFAULT_INFO_OPTIONS, showDelta: false, showStint: false, showGrip: false, showDamage: false,
    })
    const fewerHtml = await renderToString(createSSRApp(InfoHud, { model: fewer, localTimeValue: '', backgroundOpacity: 0.8 }))
    expect([...fewerHtml.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map(match => match[1])).toEqual(['Best'])
    expect(fewerHtml).not.toContain('info-delta')
  })
})
