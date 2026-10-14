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
  it('PIP-509: the horizontal Tools group reserves no column for a hidden button', () => {
    const horizontal = styles.slice(styles.indexOf('.overlay-content--horizontal'))
    expect(horizontal).toMatch(/\.quick-panel-secondary \{\s*position: relative; padding-left: 10px;\s*\/\/ PIP-509[^\n]*\n\s*grid-template-columns: none;/)
    // The full-width status line takes the buttons' width instead of widening their columns.
    expect(styles).toMatch(/\.quick-panel-horizontal-feedback \{\s*grid-column: 1 \/ -1;[\s\S]{0,200}?width: 0;\s*min-width: 100%;/)
  })
  it('PIP-518: horizontal ACC row is Tools, Benzina, Riferimenti, Avvisi vocali, messages column', () => {
    const block = styles.slice(styles.indexOf('// PIP-518'), styles.indexOf('// Vertical quick panel'))
    const order = (selector: string) => Number(block.match(new RegExp(`${selector.replace(/[[\]().>]/g, m => `\\${m}`)} \\{[^}]*?order: (\\d+)`))?.[1])
    expect([order('.quick-panel-secondary'), order('.quick-panel-automations > .fuel-panel'),
      order(".quick-panel-section[aria-label='Riferimenti numerici']"), order(".quick-panel-section[aria-label='Avvisi vocali']"),
      order('.quick-panel-horizontal-side')]).toEqual([1, 2, 3, 4, 5])
    expect(block).toContain('.training-overlay--launcher .overlay-content--horizontal:has(.quick-panel-automations) {')
    expect(block).toMatch(/\.quick-panel-automations > \.fuel-panel \{ order: 2; width: auto; \}/)       // never the whole row
    expect(block).toMatch(/> \.quick-panel-heading \{ position: absolute; top: 0; left: 0; width: 100%;/) // Tools title over its buttons
    // Messages, fuel status, pressure plan and friend requests share the last column.
    for (const id of ['quick-panel-horizontal-feedback', 'quick-panel-horizontal-fuel-status', 'quick-panel-horizontal-pressure', 'quick-panel-horizontal-requests']) {
      expect(source.indexOf(`id="${id}"`), id).toBeGreaterThan(source.indexOf('class="quick-panel-horizontal-side"'))
    }
    expect(source).toContain(`:status-target="isHorizontalQuickPanel ? '#quick-panel-horizontal-fuel-status' : '#control-k-fuel-status'"`)
    expect(source).toContain('<Teleport defer to="#quick-panel-horizontal-pressure" :disabled="!isHorizontalQuickPanel">')
    expect(source).toContain('<Teleport defer to="#quick-panel-horizontal-requests" :disabled="!isHorizontalQuickPanel">')
    expect(source).toContain('v-show="isHorizontalQuickPanel && !waitingForSimulator" class="quick-panel-horizontal-side" :inert="isFullQuickPanelPreview || undefined"')
    // The wheel follows the screen order in both layouts.
    expect(source).toContain("() => !!overlayRoot.value?.querySelector('.overlay-content--launcher .launcher-tools'),")
  })
  it('PIP-522: Pit title, lap badge, one context line and outcomes only as messages', () => {
    expect(source).toContain('<h2 class="quick-panel-heading">Pit</h2>')
    expect(source).not.toContain('<h2 class="quick-panel-heading">Tools</h2>')
    expect(source).toContain('<small v-if="pressureBadge" class="quick-action-badge" aria-hidden="true">{{ pressureBadge }}</small>')
    // The permanent pressure line is gone from view; screen readers keep it.
    expect(source).toContain('<p id="pressure-action-status" class="quick-panel-visually-hidden">')
    expect(source).toMatch(/<p v-if="pressureOutcome" class="launcher-hint quick-panel-pressure-status"/)
    expect(source).toContain("if (actionId === 'pressure' && quickPanelPressureState.value.state !== 'ready') return `Pressioni: ${dryPressurePresentation.value.guidance}`")
    expect(source).toContain('const PRESSURE_SUCCESS_VISIBLE_MS = 5000')
    // The watcher reads the pressure state at setup: it must come after its declaration.
    expect(source.indexOf('watch(() => pressureOutcomeMessage(quickPanelPressureState.value)'))
      .toBeGreaterThan(source.indexOf('const quickPanelPressureState = computed('))
  })
  it('PIP-522: the horizontal header is the first column, the layout switch replaces the logo on hover', () => {
    const block = styles.slice(styles.indexOf('// PIP-522: horizontal header'), styles.indexOf('// PIP-522: lap progress'))
    expect(block).toContain('.launcher-tools { display: flex; align-items: flex-start; gap: 12px; }')
    expect(block).toMatch(/flex-direction: column;[\s\S]*?width: 66px; height: 84px;/)
    expect(block).toContain('.quick-panel-layout { position: absolute; top: 0; left: 0;')
    expect(block).toContain('.quick-panel-logo { opacity: 0; }')
    // The old header widths reserved for messages over the row no longer exist.
    expect(styles).not.toContain('width: calc(100% - 226px)')
    expect(styles).not.toContain('width: calc(100% - 456px)')
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
