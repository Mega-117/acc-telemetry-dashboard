import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('../app/pages/training-overlay.vue', import.meta.url)), 'utf8')
const styles = readFileSync(fileURLToPath(new URL('../app/assets/scss/_training-overlay.scss', import.meta.url)), 'utf8')

describe('training overlay Setup pressure contract', () => {
  it('presents the neutral product action without the retired popup', () => {
    expect(source).toContain('Regola pressioni')
    expect(source).toContain('dryPressureState.qaActive')
    expect(source).toContain('row.totalLossPsi')
    expect(source).toContain('row.targetPsi')
    expect(source).toContain('pressure-plan__table')
    expect(source).not.toContain('pressurePopupVisible')
    expect(source).not.toContain('pressureNotification')
    expect(source).not.toContain('pressure-recommendation-popup')
    expect(source).toMatch(/async function refreshDryPressureState\(\)[\s\S]*dryPressureState\.value = next[\s\S]*scheduleOverlaySizeSync\(\)/)
  })

  it('keeps the pressure action visible, disabled outside ready and pulsing only when ready', () => {
    expect(source).toContain("'is-ready': dryPressureState.state === 'ready'")
    expect(source).toContain(":disabled=\"dryPressureState.state !== 'ready'\"")
    expect(source).toContain('launcher-tool-button--pressure')
    expect(source).toContain('dryPressurePresentation.guidance')
    expect(styles).toContain('pressure-action-ready-pulse 2.4s ease-in-out infinite')
    expect(styles).toContain('box-shadow: inset 0 0 18px')
    expect(styles).toContain('50% { opacity: 1; }')
    expect(styles).toMatch(/prefers-reduced-motion:[\s\S]*launcher-tool-button--pressure\.is-ready::before[\s\S]*animation: none/)
    expect(styles).toMatch(/launcher-tool-button--pressure:disabled[\s\S]*cursor: not-allowed/)
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
