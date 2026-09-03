import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
}

describe('spectator HUD source contract', () => {
  it.each([
    'app/pages/dashboard-overlay.vue',
    'app/pages/info-overlay.vue',
    'app/pages/tyres-overlay.vue',
    'app/pages/sectors-overlay.vue',
  ])('%s usa il selettore centralizzato', (file) => {
    const content = source(file)
    expect(content).toContain('useOverlayTelemetrySource')
    expect(content).not.toContain("from '~/composables/useFastStatePoller'")
  })

  it('Settori sceglie il SectorHud del focus soltanto in modalita spectator', () => {
    const content = source('app/pages/sectors-overlay.vue')
    expect(content).toContain("telemetry.source.value === 'focused'")
    expect(content).toContain(':sector-hud="visibleSectorHud"')
    expect(content).toContain('valid: focusedDisplayedLapValid.value')
    expect(content).toContain('resolveLocalCompactPresentation(fastState.value)')
    expect(content).toContain('? fastState.value.sectorHud')
    expect(content).not.toContain('resolveCurrentLapValidity(')
    expect(content).not.toContain(':live-lap-valid=')
  })

  it('Dashboard e gomme distinguono dati non disponibili da zero', () => {
    const dashboard = source('app/components/overlay/DashboardHud.vue')
    const dashboardPage = source('app/pages/dashboard-overlay.vue')
    const classicTyres = source('app/components/overlay/TyreSlipHud.vue')
    const advancedTyres = source('app/components/overlay/TyreAdvancedHud.vue')

    expect(dashboard).toContain("'inputs--unavailable': !model.inputsAvailable")
    expect(dashboard).toContain('.inputs--unavailable::after')
    expect(classicTyres).toContain('props.fastState.speedKmh !== null')
    expect(classicTyres).not.toContain('hasLiveTyres.value && props.fastState.speedKmh')
    expect(advancedTyres).toContain('resolveTyreHudStatus(props.fastState)')
    expect(advancedTyres).toContain("'data-unavailable': 'DATA N/A'")
    expect(dashboardPage).toContain('telemetry.focusedCar.value')
    expect(dashboard).toContain('v-if="model.spectator"')
    expect(dashboard).toContain('model.spectator.timings')
    expect(dashboard).toContain("['RPM', 'INPUT', 'FUEL', 'MAP', 'TC', 'TC2', 'ABS', 'BB', 'DELTA']")
    expect(dashboard).toContain('<small>N/A</small>')
  })

  it('Dashboard riceve il push focused subito e usa un fallback bounded a 250 ms', () => {
    const dashboardPage = source('app/pages/dashboard-overlay.vue')
    const overlaySource = source('app/composables/useOverlayTelemetrySource.ts')
    const standingsState = source('app/composables/useStandingsState.ts')

    expect(dashboardPage).toContain('FOCUSED_CAR_FEED_INTERVAL_MS')
    expect(overlaySource).toContain('export const FOCUSED_CAR_FEED_INTERVAL_MS = 250')
    expect(overlaySource).toContain("subscribe: 'onFocusedCarStateUpdate'")
    expect(standingsState).toContain('lastPushAtMs = Date.now()')
    expect(standingsState).toContain('tickMs - lastPushAtMs >= safePollIntervalMs')
  })

  it('Race dichiara la fisica focused mancante invece di spegnere il pannello', () => {
    // PIP-270: spegnere l'intera sezione lasciava visibile il solo pannello
    // opaco, cioe' il rettangolo nero visto dal pilota mentre guardava un
    // altro. La griglia resta montata e la fascia dice perche' i valori
    // sono `--`; la regola e' quella condivisa con l'Avanzato.
    const tyresPage = source('app/pages/tyres-overlay.vue')
    const shared = source('app/utils/tyreSlipPresentation.ts')

    expect(tyresPage).toContain('resolveTyreHudStatus(fastState.value)')
    expect(tyresPage).toContain("'data-unavailable': 'DATA N/A'")
    expect(tyresPage).not.toContain('v-show="raceVisible"')
    expect(tyresPage).not.toContain("telemetrySource.value !== 'focused'")
    expect(tyresPage).not.toContain('fastState.value.tyres.length === 4')
    expect(shared).toContain("if (state.dataSource === 'focused') return 'data-unavailable'")
  })
})
