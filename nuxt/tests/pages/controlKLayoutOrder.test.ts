import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// PIP-509: Ctrl+K layout contract (order, driving compaction, waiting state).
const source = readFileSync(fileURLToPath(new URL('../../app/pages/training-overlay.vue', import.meta.url)), 'utf8')
const styles = readFileSync(fileURLToPath(new URL('../../app/assets/scss/_training-overlay.scss', import.meta.url)), 'utf8')

describe('Ctrl+K layout order (PIP-509)', () => {
  it('renders the audio alerts after every other button group', () => {
    const voice = source.indexOf('<QuickPanelVoiceControls')
    for (const marker of ['aria-label="Riferimenti numerici"', 'class="quick-panel-section quick-panel-automations"', 'data-overlay-wheel-action="pitwall"', 'launcher-tool-button--pressure', '<ControlKFriendRequests']) {
      expect(source.indexOf(marker), marker).toBeGreaterThan(0)
      expect(voice, marker).toBeGreaterThan(source.indexOf(marker))
    }
    expect(source.match(/<QuickPanelVoiceControls/g)).toHaveLength(1)
  })
  it('keeps the vertical grid groups in the first row and the audio row last', () => {
    expect(styles).toMatch(/\.quick-panel-section\[aria-label='Avvisi vocali'\] \{\s*order: 98;/)
    expect(styles).toMatch(/\.quick-panel-section\[aria-label='Riferimenti numerici'\] \{\s*display: grid;\s*grid-row: 1;/)
    expect(styles).not.toContain("border-bottom: 1px solid #ffffff1a; }\n    .quick-panel-automations")
  })
  it('hides a disabled Pressioni button while driving, keeps it when usable or in the box', () => {
    expect(source).toContain('v-if="showPressureButton"')
    expect(source).toMatch(/const showPressureButton = computed\(\(\) => isFullQuickPanelPreview\.value \|\| !hideStintWhileDriving\.value\s*\|\| isDryPressureApplying\.value \|\| quickPanelPressureState\.value\.state === 'ready'\)/)
  })
  it('shows a waiting placeholder instead of partial tools when no simulator is detected', () => {
    expect(source).toContain(`<p v-if="waitingForSimulator" class="quick-panel-waiting" role="status">{{ simulatorPresence.choiceRequired.value ? 'Scegli il gioco nella webapp' : 'In attesa del simulatore' }}</p>`)
    expect(source).toContain('<div v-else class="quick-panel-main"')
    expect(source).toMatch(/const waitingForSimulator = computed\(\(\) => !isFullQuickPanelPreview\.value\s*&& simulatorPresence\.gameId\.value !== 'synthetic'\s*&& !quickPanelSupport\.value\.quickVoiceControls && !quickPanelSupport\.value\.quickAutomations\)/)
    // PIP-510: the layout follows the game from the menus on, through useSimulatorPresence.
    expect(source).toContain('const support = computed(() => gameUiSupport(simulatorPresence.gameId.value))')
    expect(styles).toContain('.training-overlay--launcher .quick-panel-waiting {')
  })
})
