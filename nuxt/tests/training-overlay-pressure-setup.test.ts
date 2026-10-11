import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('../app/pages/training-overlay.vue', import.meta.url)), 'utf8')
const styles = readFileSync(fileURLToPath(new URL('../app/assets/scss/_training-overlay.scss', import.meta.url)), 'utf8')

describe('training overlay Setup pressure contract', () => {
  it('keeps disabled fuel actions visible while applying in both panel orientations', () => {
    expect(styles).not.toContain("[data-overlay-wheel-action='fuel-session']:disabled { display: none; }")
    expect(styles).toContain("[data-overlay-wheel-action='fuel-session']:disabled:not([aria-busy='true']) { display: none; }")
    expect(styles).toContain(":not(:has(.fuel-panel button:not(:disabled), .fuel-panel button[aria-busy='true']))")
    expect(styles).toContain(".fuel-panel:not(:has(button:not(:disabled), button[aria-busy='true']))")
  })
  it('offers an accessible independent audio action on the existing wheel navigation', () => {
    expect(source).toContain(':pressure="isFullQuickPanelPreview || pressureWarningsEnabled"')
    expect(source).toContain('@toggle-pressure="togglePressureAudio"')
    expect(source).toMatch(/function togglePressureAudio\(\) \{\s*if \(!canUseSpotterControls.value\) return\s*togglePressureWarnings\(\)/)
    expect(source).toContain(':disabled="isDryPressureApplying || quickPanelPressureState.state !== \'ready\'"')
  })
  it('presents the neutral product action without the retired popup', () => {
    expect(source).toContain('Regola pressioni')
    expect(source).toContain('quickPanelPressureState.qaActive')
    expect(source).toContain('isFullQuickPanelPreview.value ? quickPanelPreview.value!.pressure : dryPressureState.value')
    expect(source).toContain('row.totalLossPsi')
    expect(source).toContain('row.targetPsi')
    expect(source).toContain('pressure-plan__table')
    expect(source).not.toContain('pressurePopupVisible')
    expect(source).not.toContain('pressureNotification')
    expect(source).not.toContain('pressure-recommendation-popup')
    expect(source).toMatch(/async function refreshDryPressureState\(\)[\s\S]*dryPressureState\.value = next[\s\S]*scheduleOverlaySizeSync\(\)/)
  })

  it('keeps the pressure action visible, disabled outside ready and pulsing only when ready', () => {
    expect(styles).not.toContain("[data-overlay-wheel-action='pressure']:disabled:not(.is-awaiting-pit) { display: none; }")
    expect(source).toContain('<p id="pressure-action-status"')
    expect(source).toContain("'is-ready': quickPanelPressureState.state === 'ready'")
    expect(source).toContain(":disabled=\"isDryPressureApplying || quickPanelPressureState.state !== 'ready'\"")
    expect(source).toContain('launcher-tool-button--pressure')
    expect(source).toContain('dryPressurePresentation.guidance')
    expect(styles).toContain('pressure-action-ready-pulse 2.4s ease-in-out infinite')
    expect(styles).toContain('box-shadow: inset 0 0 18px')
    expect(styles).toContain('50% { opacity: 1; }')
    expect(styles).toMatch(/prefers-reduced-motion:[\s\S]*launcher-tool-button--pressure\.is-ready::before[\s\S]*animation: none/)
    expect(styles).toMatch(/launcher-tool-button--pressure:disabled[\s\S]*cursor: not-allowed/)
    expect(source).toContain("state: response?.retryable ? 'ready' : 'blocked'")
    expect(source).toContain('actionReasonCode: response?.reasonCode || null')
  })

  it('removes the yellow alert while retaining pressure guidance in both layouts', () => {
    expect(source).not.toContain('v-if="dryPressurePresentation.alert"')
    expect(source).not.toContain('pressure-invalid-lap-alert')
    expect(source).toContain(':title="dryPressurePresentation.ariaLabel')
    expect(source).toContain('id="pressure-action-status"')
    expect(source).toContain('dryPressurePresentation.guidance')
    expect(source).not.toContain("dryPressureState.reason || 'Attendo tre giri completi")
    expect(styles).toContain('.launcher-tools__header .quick-panel-training { display: none; }')
  })

  it('does not present Pit MFD values or a hardcoded dry-only product label', () => {
    expect(source).not.toContain('Regola pressioni — asciutto')
    expect(source).not.toContain('MFD non disponibile')
    expect(source).not.toContain('target 27,0')
  })

  it('uses main-process attestation as the single auth source in Control K', () => {
    expect(source).toContain('resolveLocalRuntimeCapability')
  })

})
