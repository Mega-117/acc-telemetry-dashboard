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
    expect(page).toContain('useFastStatePoller(getApi)')
    expect(page).toContain('route.query.standingsBootstrap')
    expect(page).toContain('useStandingsHighlights(standings.state, standings.nowMs)')
    expect(page).toContain('standings.start()')
    expect(page).toContain('fastState.startFastStatePolling()')
    expect(page).toContain('await firstFastState')
    expect(page).toContain("hudOverlayContentReady?.('standings')")
    expect(page).toContain('requestAnimationFrame(() => requestAnimationFrame')
    expect(page).toContain('standingsHighlights.stop()')
    expect(page).toContain('standings.stop()')
    expect(page).toContain('fastState.stopFastStatePolling()')
  })

  it('usa esclusivamente il layout persistito/bootstrap del manager e non deriva geometria dal renderer', () => {
    expect(page).toContain('model.value.layout.width')
    expect(page).toContain('model.value.layout.height')
    expect(page).not.toMatch(/\.overlay-canvas\{[^}]*width:\s*900px|height:\s*600px/s)
    expect(page).not.toContain('setTransientViewport')
    expect(hud).toContain(':style="layoutStyle"')
    expect(hud).not.toMatch(/\.standings-hud\s*\{[^}]*width:\s*900px|height:\s*600px;/s)
    expect(hud).toMatch(/\.standings-hud\s*\{[^}]*border-radius:\s*8px;/s)
    expect(hud).toContain('v-if="model.visible"')
    expect(hud).toContain('<HudOverlayBackground :opacity="backgroundOpacity" />')
  })

  it('renderizza metadati, temperatura e sole label Best/Last', () => {
    const headerFields = [
      'model.header.sessionType',
      'model.header.timeLeft',
      'model.header.temperatures',
    ]
    const positions = headerFields.map(field => hud.indexOf(field))
    expect(positions.every(position => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
    expect(hud).toContain('class="standings-header__left"')
    expect(hud).toContain('class="standings-header__temperature"')
    expect(hud).toMatch(/\.standings-header__temperature\s*\{[^}]*margin-left:\s*auto;/s)
    expect(hud).not.toContain('STANDINGS')
    expect(hud).toContain('standings-columns')
    expect(hud).toMatch(/<strong v-if="model\.columns\.bestLap">Best<\/strong>/)
    expect(hud).toMatch(/<strong v-if="model\.columns\.lastLap">Last<\/strong>/)
    expect(hud).not.toContain('model.header.carClass')
    expect(hud).not.toContain('row.delta')
    expect(hud).not.toContain('teamName')
    expect(hud).not.toContain('is-focused')
    expect(hud).toContain("'is-local': row.local")
    expect(hud).not.toContain('AIR/TRK')
    expect(hud).not.toContain('nth-child')
  })

  it('usa la griglia manager-owned e il progress come bordo assoluto a tutta riga', () => {
    expect(hud).toContain('gridTemplateColumns')
    expect(hud).not.toContain('model.layout.columnWidths.progress')
    expect(hud).toContain('class="standings-row__progress-track"')
    expect(hud).toMatch(/\.standings-row__progress-track\s*\{[^}]*position:\s*absolute;[^}]*right:\s*0;[^}]*bottom:\s*0;[^}]*left:\s*0;[^}]*height:\s*2px;/s)
    expect(hud).toMatch(/\.standings-row__progress\s*\{[^}]*height:\s*100%;[^}]*opacity:\s*0\.72;/s)
    expect(hud).toMatch(/\.standings-row\s*\{[^}]*display:\s*grid;[^}]*height:\s*var\(--standings-row-height\)/s)
    expect(hud).toMatch(/\.standings-rows\s*\{[^}]*row-gap:\s*var\(--standings-row-gap\)/s)
    expect(hud).not.toContain('.standings-row.has-progress')
    expect(hud).toMatch(/\.standings-row__position\s*\{[^}]*height:\s*28px;/s)
    expect(hud).toMatch(/\.standings-row__manufacturer\s*\{[^}]*height:\s*28px;/s)
    expect(hud).toMatch(/\.standings-row__number\s*\{[^}]*height:\s*28px;/s)
    expect(hud).toMatch(/\.standings-row__pit\s*\{[^}]*height:\s*28px;/s)
    expect(hud).toContain("'is-local': row.local")
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
    expect(hud).toMatch(/\.standings-row__driver\s*\{[^}]*text-overflow:\s*ellipsis/s)
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
