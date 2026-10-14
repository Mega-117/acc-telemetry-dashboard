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
    // PIP-532: ...or while the lap measurement runs (its badge must be seen while driving).
    expect(source).toMatch(/const showPressureButton = computed\(\(\) => isFullQuickPanelPreview\.value \|\| !hideStintWhileDriving\.value\s*\|\| isDryPressureApplying\.value \|\| quickPanelPressureState\.value\.state === 'ready' \|\| !!pressureBadge\.value\)/)
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
    // The one-line hint stays under the row; PIP-532 moved everything else to Notifiche.
    expect(source.indexOf('id="quick-panel-horizontal-feedback"')).toBeGreaterThan(source.indexOf('class="quick-panel-horizontal-side"'))
    expect(source).toContain('v-show="isHorizontalQuickPanel && !waitingForSimulator && !isNotificationsOpen" class="quick-panel-horizontal-side" :inert="isFullQuickPanelPreview || undefined"')
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
  it('PIP-522/527: horizontal header column; the layout switch in the top-right corner on hover', () => {
    const block = styles.slice(styles.indexOf('// PIP-522: horizontal header'), styles.indexOf('// PIP-522: lap progress'))
    expect(block).toContain('.launcher-tools { display: flex; align-items: flex-start; gap: 12px; }')
    expect(block).toMatch(/flex-direction: column;[\s\S]*?width: 66px; height: 84px;/)
    // PIP-532: inside the panel (at -12 px the icons were clipped and not clickable).
    expect(block).toContain('.quick-panel-layout { position: absolute; top: 0; right: 0;')
    expect(block).toContain('.quick-panel-layout button { width: 22px; height: 14px; min-height: 0; }')
    expect(source).toContain('<QuickPanelLayoutToggle v-show="!isNotificationsOpen"')
    expect(block).not.toMatch(/quick-panel-layout \{ position: absolute; top: -/)
    // The logo stays: the switch no longer covers it (PIP-527).
    expect(styles).not.toContain('.quick-panel-logo { opacity: 0; }')
    // Vertical: the timer keeps the corner, the switch appears just left of it.
    expect(styles).toContain('.quick-panel-layout { grid-column: 3; grid-row: 1; justify-self: end; }')
    // The old header widths reserved for messages over the row no longer exist.
    expect(styles).not.toContain('width: calc(100% - 226px)')
    expect(styles).not.toContain('width: calc(100% - 456px)')
  })
  it('PIP-527: messages under the row, centred and never wider; vertical driving on one row', () => {
    const block = styles.slice(styles.indexOf('// PIP-527: messages, fuel status'), styles.indexOf('// Vertical quick panel'))
    expect(block).toMatch(/\.quick-panel-horizontal-side \{\s*order: 6; flex-basis: 100%; width: 0; min-width: 100%;/)
    expect(block).toContain('justify-content: center')
    expect(block).toMatch(/quick-panel-main:has\(\.quick-panel-automations\.quick-panel-driving:not\(\.quick-panel-show-all\)\) \{[\s\S]{0,300}?display: flex; flex-direction: row;/)
  })
  it('PIP-526: wheel Back everywhere, timer last in the cycle, first open on Pitwall', () => {
    const selection = readFileSync(fileURLToPath(new URL('../../app/composables/useOverlayActionSelection.ts', import.meta.url)), 'utf8')
    expect(source).toContain('data-overlay-wheel-action="timer" data-overlay-wheel-last @click="openQuickTimer"')
    expect(selection).toContain("button.hasAttribute('data-overlay-wheel-last')")
    expect(selection).toContain('return [...ordered, ...last]')
    expect(source).toContain("actionSelection.select('pitwall'); actionSelection.refresh()")
    // A value being edited consumes the wheel first; Back leaves the timer for the panel.
    expect(source).toContain('sectorReferenceSetup.value?.handleWheelCommand?.(command)')
    // PIP-532: the notifications view is closed first, then the timer.
    expect(source).toMatch(/function runBackAction\(\) \{\s*if \(isNotificationsOpen\.value\) \{ closeNotifications\(\); return \}\s*if \(isQuickTimerOpen\.value\) \{ leaveQuickTimer\(\); return \}/)
    expect(source).toContain("function openFuelSetup() { isFuelSetupOpen.value = true; void nextTick(() => actionSelection.select('fuel-plus')) }")
    expect(source).toContain("selectedWheelActionId.value = 'target-time'")
    expect(source).toContain('<span>Giro obiettivo</span>')
    expect(source).toContain('<span>Settori obiettivo</span>')
  })
  it('PIP-532: notifications view next to the timer replaces the buttons; pressure badge seen while driving', () => {
    // Everything worth reading is teleported into the Notifiche view, in both layouts.
    for (const id of ['quick-panel-notification-fuel', 'quick-panel-notification-pressure', 'quick-panel-notification-requests']) {
      expect(source.indexOf(`id="${id}"`), id).toBeGreaterThan(source.indexOf('class="quick-panel-notifications"'))
    }
    expect(source).toContain('status-target="#quick-panel-notification-fuel"')
    expect(source).toContain('<Teleport defer to="#quick-panel-notification-pressure">')
    expect(source).toContain('<Teleport defer to="#quick-panel-notification-requests">')
    expect(source).not.toContain('quick-panel-horizontal-fuel-status')
    // The bell sits next to the timer and only exists while there is something to read.
    const timer = source.indexOf('data-overlay-wheel-action="timer"')
    const bell = source.indexOf('data-overlay-wheel-action="notifications"')
    expect(bell).toBeGreaterThan(timer)
    expect(source).toContain('v-if="notificationCount > 0 && !isNotificationsOpen"')
    // Open view hides the buttons; X / wheel Back closes it; a new error opens it.
    expect(source).toContain(":class=\"{ 'quick-panel-main--behind-notifications': isNotificationsOpen }\"")
    expect(styles).toContain('.quick-panel-main--behind-notifications { display: none !important; }')
    expect(source).toMatch(/function runBackAction\(\) \{\s*if \(isNotificationsOpen\.value\) \{ closeNotifications\(\); return \}/)
    expect(source).toContain('if (errors > notificationErrorCount) openNotifications()')
    expect(source).toContain('data-overlay-wheel-action="notifications-close" @click="closeNotifications"')
    // The lap badge keeps the Pressioni button visible while the measurement runs.
    expect(source).toMatch(/quickPanelPressureState\.value\.state === 'ready' \|\| !!pressureBadge\.value\)/)
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
