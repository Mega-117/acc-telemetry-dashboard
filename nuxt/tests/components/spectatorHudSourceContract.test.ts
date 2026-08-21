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
    expect(content).toContain('resolveCurrentLapValidity(')
    expect(content).toContain('visibleSectorHud.value?.lapValid')
    expect(content).not.toContain('const liveLapValid = computed(() => fastState.value.info?.lapValid')
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
    expect(advancedTyres).toContain("props.fastState.dataSource === 'focused'")
    expect(advancedTyres).toContain("return 'DATA N/A'")
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
})
