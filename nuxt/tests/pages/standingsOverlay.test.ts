import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Standings overlay contract', () => {
  const page = readFileSync(resolve(process.cwd(), 'app/pages/standings-overlay.vue'), 'utf8')
  const hud = readFileSync(resolve(process.cwd(), 'app/components/overlay/StandingsHud.vue'), 'utf8')
  const settings = readFileSync(resolve(process.cwd(), 'app/pages/hud.vue'), 'utf8')
  const overlayComposable = readFileSync(resolve(process.cwd(), 'app/composables/useHudOverlay.ts'), 'utf8')

  it('usa la route HUD condivisa e il bridge standings ristretto', () => {
    expect(page).toContain("definePageMeta({ layout: 'hud-overlay' })")
    expect(page).toContain("useHudOverlay('standings', getApi)")
    expect(page).toContain('useStandingsState(getApi)')
    expect(page).toContain('useStandingsHighlights(standings.state, standings.nowMs)')
    expect(page).toContain('standings.start()')
    expect(page).toContain('standingsHighlights.stop()')
    expect(page).toContain('standings.stop()')
  })

  it('mantiene canvas nativo 900x600 e nasconde tutto senza modello affidabile', () => {
    expect(page).toMatch(/\.overlay-canvas\{[^}]*width:900px;height:600px/s)
    expect(hud).toMatch(/\.standings-hud\s*\{[^}]*width:\s*900px;[^}]*height:\s*600px;/s)
    expect(hud).toMatch(/\.standings-hud\s*\{[^}]*border-radius:\s*8px;/s)
    expect(hud).toContain('v-if="model.visible"')
    expect(hud).toContain('<HudOverlayBackground :opacity="backgroundOpacity" />')
  })

  it('renderizza l’header reference e nessuna colonna/focus di riga inventati', () => {
    const headerFields = [
      'model.header.sessionType',
      'model.header.timeLeft',
      'model.header.temperatures',
      'model.header.carClass',
    ]
    const positions = headerFields.map(field => hud.indexOf(field))
    expect(positions.every(position => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
    expect(hud).toContain('class="standings-header__left"')
    expect(hud).toContain('class="standings-header__right"')
    expect(hud).toMatch(/\.standings-header__right\s*\{\s*margin-left:\s*auto;/s)
    expect(hud).not.toContain('STANDINGS')
    expect(hud).not.toContain('standings-columns')
    expect(hud).not.toContain('row.delta')
    expect(hud).not.toContain('teamName')
    expect(hud).not.toContain('is-focused')
    expect(hud).not.toContain('nth-child')
  })

  it('mantiene larghezze e highlight sulle sole celle reference', () => {
    expect(hud).toMatch(/\.standings-row__position\s*\{[^}]*flex:\s*0 0 30px;/s)
    expect(hud).toMatch(/\.standings-row__driver\s*\{[^}]*140px;/s)
    expect(hud).toMatch(/\.standings-row__number\s*\{[^}]*50px;/s)
    expect(hud).toMatch(/\.standings-row__pit\s*\{[^}]*22px;/s)
    expect(hud).toMatch(/\.standings-row__best,[\s\S]*?\.standings-row__last\s*\{[^}]*76px;/s)
    expect(hud).toMatch(/\.standings-row__progress\s*\{[^}]*height:\s*4px;[^}]*opacity:\s*0\.6;/s)
    expect(hud).toMatch(/\.standings-row\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;/s)
    expect(hud).toMatch(/\.standings-row\.has-progress\s*\{[^}]*height:\s*28px;[^}]*padding-bottom:\s*4px;/s)
    expect(hud).toMatch(/\.standings-row__position\s*\{[^}]*height:\s*24px;/s)
    expect(hud).toContain(":class=\"{ 'has-progress': model.columns.progress && row.hasProgress }\"")
    expect(hud).toContain("row.inPitLane ? 'P' : ''")
    expect(hud).toContain('row.positionFlash')
    expect(hud).toContain('row.lastLapPersonalBest')
    expect(hud).toMatch(/\.standings-row__position\.is-improved\s*\{[^}]*color:\s*white;[^}]*background:\s*green;/s)
    expect(hud).toMatch(/\.standings-row__position\.is-worsened\s*\{[^}]*color:\s*white;[^}]*background:\s*red;/s)
    expect(hud).toMatch(/\.standings-row__last\.is-pb-focused\s*\{\s*color:\s*yellow;\s*\}/s)
    expect(hud).toMatch(/\.standings-row__last\.is-pb-other\s*\{\s*color:\s*green;\s*\}/s)
    expect(hud).not.toMatch(/\.standings-row__last\.is-pb-(?:focused|other)\s*\{[^}]*background:/s)
    expect(hud).not.toMatch(/animation:|@keyframes|brightness\(/)
    expect(hud).not.toContain('grid-auto-rows: 32px')
  })

  it('non renderizza celle prive di provider', () => {
    expect(hud).not.toMatch(/LFM|Safety Rating|Elo|Incident|Stint|BoP|turn/i)
    expect(settings).not.toMatch(/showLfm|LFM Safety Rating|LFM Elo Rating|LFM BOP/)
    expect(settings).toContain("{ key: 'showIncidents', label: 'Incidents', supported: false")
    expect(settings).toContain(':disabled="selectedSettingsDisabled || !option.supported"')
    expect(settings).toContain('Richiede provider incidenti.')
  })

  it('usa slider 0..5 visibili e step scala 0.1 solo per Standings', () => {
    expect(overlayComposable).toContain('showIncidents?: boolean')
    expect(settings).toContain(':step="selectedOverlayId === \'standings\' ? 0.1 : 0.05"')
    for (const label of ['Top Cars', 'Cars Ahead', 'Cars Behind']) {
      expect(settings).toContain(`<span><strong>${label}</strong></span>`)
      expect(settings).toContain(`aria-label="${label}"`)
    }
    expect(settings.match(/type="range"/g)?.length).toBeGreaterThanOrEqual(5)
    expect(settings).toContain('<b>{{ standingsSettings.topCars }}</b>')
    expect(settings).toContain('<b>{{ standingsSettings.carsAhead }}</b>')
    expect(settings).toContain('<b>{{ standingsSettings.carsBehind }}</b>')
    for (const label of [
      'Car Number', 'Fastest Lap', 'Last Lap', 'Stint Time', 'Lap Progress',
      'Incidents', 'Turn Number',
    ]) expect(settings).toContain(`label: '${label}'`)
  })
})
