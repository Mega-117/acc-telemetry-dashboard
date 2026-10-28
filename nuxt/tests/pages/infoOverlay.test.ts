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
    expect(hud).toMatch(/\.info-hud\s*\{[^}]*width:\s*344px;[^}]*height:\s*auto;/s)
    expect(hud).not.toContain('height: 512px')
    expect(hud).toContain('overflow: visible')
    expect(page).toContain("api.hudOverlaySetSize('info'")
    expect(page).toContain('api.overlayRegionId ? canvas.parentElement?.clientWidth || rect.width : window.innerWidth')
    expect(page).toContain('height: Math.ceil(rect.height)')
    expect(page).toContain("'--hud-scale': String(overlay.scale.value)")
    expect(page).toContain('new ResizeObserver')
  })

  it('style A (28/10): Delta fill grows from a white centre line, colours unchanged', () => {
    const hud = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoHud.vue'), 'utf8')

    expect(hud).toContain('class="info-delta__bar"')
    expect(hud).toContain(':style="infoDeltaFillStyle(model.delta)"')
    expect(hud).toMatch(/\.info-delta__bar::after\s*\{[^}]*left:\s*50%;[^}]*width:\s*2px;[^}]*background:\s*#fff;/s)
    expect(hud).toContain('.info-delta--negative .info-delta__bar i { background: #9acd32; }')
    expect(hud).toContain('.info-delta--positive .info-delta__bar i { background: #ff0000; }')
    expect(hud).toContain('.info-delta--purple .info-delta__bar i { background: #b600b6; }')
    expect(hud).not.toContain('info-delta__half')
  })

  it('style A (28/10): only the top-right corner is cut, its border drawn back, no red bar on top', () => {
    const hud = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoHud.vue'), 'utf8')

    // Owner: bottom-left is a normal square corner.
    expect(hud).toContain('clip-path: polygon(0 0, calc(100% - var(--info-cut)) 0, 100% var(--info-cut), 100% 100%, 0 100%);')
    expect(hud).not.toContain('info-hud__cut--bottom')
    // The line sits on the border-box diagonal (absolute boxes start inside the 1px border).
    expect(hud).toMatch(/\.info-hud > \.info-hud__cut\s*\{[^}]*top:\s*-1px;[^}]*left:\s*calc\(100% \+ 1px - var\(--info-cut\)\);[^}]*width:\s*calc\(var\(--info-cut\) \* 1\.4142\);[^}]*background:\s*var\(--info-line\);[^}]*transform:\s*rotate\(45deg\);[^}]*transform-origin:\s*0 0;/s)
    // Owner (28/10): labels readable at the 0.6 minimum. Floors are rendered px divided by the canvas scale.
    // Owner (28/10): same text style as the Standings session type ("RACE"), size and floors unchanged.
    expect(hud).toMatch(/\.info-row dt\s*\{[^}]*color:\s*#a3a5ae;[^}]*font:\s*italic 700 max\(17px, calc\(12px \/ var\(--hud-scale, 1\)\)\)\/1\.2 var\(--hud-font-num\);[^}]*letter-spacing:\s*0\.04em;[^}]*text-transform:\s*uppercase;/s)
    const standings = readFileSync(resolve(process.cwd(), 'app/components/overlay/StandingsHud.vue'), 'utf8')
    expect(standings).toContain('.standings-header__session { color:#a3a5ae;font:italic 700 17px/1 var(--hud-font-num);letter-spacing:0.04em;text-transform:uppercase; }')
    expect(hud).toMatch(/\.info-row dd\s*\{[^}]*font:\s*italic 700 max\(20px, calc\(14px \/ var\(--hud-scale, 1\)\)\)/s)
    expect(hud).not.toMatch(/#ff0024|info-hud__accent/)
  })

  it('yellow flag: the tyres frame, 4px on the outer edge above the content, the cut included', () => {
    const hud = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoHud.vue'), 'utf8')

    expect(hud).toMatch(/\.info-hud--yellow-flag::after\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*2;[^}]*inset:\s*-1px;[^}]*border:\s*4px solid #ffd400;[^}]*pointer-events:\s*none;/s)
    expect(hud).toContain('.info-hud--yellow-flag > .info-hud__cut { height: 4px; background: #ffd400; }')
    expect(hud).not.toContain('5px solid')
  })

  it('background transparency reaches only the background layer, never the content', () => {
    const hud = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoHud.vue'), 'utf8')
    const page = readFileSync(resolve(process.cwd(), 'app/pages/info-overlay.vue'), 'utf8')

    expect(hud.match(/backgroundOpacity/g)).toHaveLength(2) // the prop and the background layer
    expect(hud).not.toMatch(/(^|[\s;{])opacity\s*:/m)
    expect(page).not.toMatch(/(^|[\s;{])opacity\s*:/m)
  })

  it('style A (28/10): renders every enabled row with its tone, fixed digits and the opacity layer', async () => {
    const model = buildInfoPresentation({
      flag: 2,
      sessionType: 2,
      info: {
        delta: { ms: 245, available: true, side: 'positive', ratio: 0.4, purple: false },
        stintTimeLeftMs: 1_530_000, fuelLabel: 'Q-Fuel', fuelNeededL: -1.8, fuelLeftTimeMs: 3_930_000,
        fuelLeftReferenceLapMs: 90_000, incidents: 2, grip: 'Optimum', pitExitTraffic: 0,
        optimalLapTimeMs: 103_260, bestLapTimeMs: 103_362, damageTimeMs: null,
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
    expect(html.match(/class="info-hud__cut"/g)).toHaveLength(1)
    expect(html).toContain('info-hud--yellow-flag')

    const fewer = buildInfoPresentation({ info: null } as unknown as FastOverlayState, {
      ...DEFAULT_INFO_OPTIONS, showDelta: false, showStint: false, showGrip: false, showDamage: false,
    })
    const fewerHtml = await renderToString(createSSRApp(InfoHud, { model: fewer, localTimeValue: '', backgroundOpacity: 0.8 }))
    expect([...fewerHtml.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map(match => match[1])).toEqual(['Best'])
    expect(fewerHtml).not.toContain('info-delta')
  })
})
