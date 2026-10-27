import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { translate } from '~/i18n'

// PIP-509: Ctrl+K layout contract (order, driving compaction, waiting state).
const source = readFileSync(fileURLToPath(new URL('../../app/pages/training-overlay.vue', import.meta.url)), 'utf8')
const styles = readFileSync(fileURLToPath(new URL('../../app/assets/scss/_training-overlay.scss', import.meta.url)), 'utf8')

describe('Ctrl+K layout order (PIP-509)', () => {
  it('renders the audio alerts after every other button group', () => {
    const voice = source.indexOf('<QuickPanelVoiceControls')
    for (const marker of ['data-quick-panel-section="references"', 'class="quick-panel-section quick-panel-automations"', 'data-overlay-wheel-action="pitwall"', 'launcher-tool-button--pressure', '<ControlKFriendRequests']) {
      expect(source.indexOf(marker), marker).toBeGreaterThan(0)
      expect(voice, marker).toBeGreaterThan(source.indexOf(marker))
    }
    expect(source.match(/<QuickPanelVoiceControls/g)).toHaveLength(1)
  })
  it('keeps the vertical grid groups in the first row and the audio row last', () => {
    expect(styles).toMatch(/\.quick-panel-section\[data-quick-panel-section='voice'\] \{\s*order: 98;/)
    expect(styles).toMatch(/\.quick-panel-section\[data-quick-panel-section='references'\] \{\s*display: grid;\s*grid-row: 1;/)
    expect(styles).not.toContain("border-bottom: 1px solid #ffffff1a; }\n    .quick-panel-automations")
  })
  // PIP-556: ACC has its own single layout (Guida/Pausa), never the old vertical
  // or horizontal ones, whatever preference was saved; no layout switch.
  it('gives ACC its own single layout regardless of old preferences', () => {
    expect(source).toContain("const isAccQuickPanel = computed(() => simulatorPresence.gameId.value === 'acc')")
    expect(source).toContain('const usesAccLayout = computed(() => isAccQuickPanel.value || isFullQuickPanelPreview.value)')
    expect(source).toMatch(/const isHorizontalQuickPanel = computed\(\(\) => phase\.value === 'launcher' && !usesAccLayout\.value[\s\S]{0,200}?quickPanelLayout\.value === 'horizontal'\)/)
    expect(source).toContain('<QuickPanelLayoutToggle v-else-if="!usesAccLayout"')
    expect(source).toContain("'overlay-content--acc': usesAccLayout && phase === 'launcher'")
    // The old vertical rules never reach the ACC grid.
    expect(styles).toContain('.overlay-content--launcher:has(.quick-panel-automations):not(.overlay-content--horizontal, .overlay-content--acc) {')
  })
  it('pairs the initial estimate before measured correction', () => {
    const pair = source.slice(source.indexOf('class="quick-panel-pressure-pair"'), source.indexOf('id="control-k-fuel-preview"'))
    expect(pair.indexOf('<PressureTestPanel')).toBeLessThan(pair.indexOf('data-overlay-wheel-action="pressure"'))
    expect(pair).toContain("<span>{{ t('controlK.fixPressuresLine1') }}<br>{{ t('controlK.fixPressuresLine2') }}</span>")
    expect(`${translate('it', 'controlK.fixPressuresLine1')} ${translate('it', 'controlK.fixPressuresLine2')}`).toBe('Correggi pressioni')
    expect(source.match(/<PressureTestPanel/g)).toHaveLength(1)
    expect(source).toContain('id="quick-panel-pressure-test-feedback"')
  })
  it('keeps Pressioni visible in driving without enabling unavailable commands', () => {
    expect(source).not.toContain('showPressureButton')
    expect(source).toContain(':disabled="isDryPressureApplying || (!usesAccLayout && quickPanelPressureState.state !== \'ready\')"')
    // PIP-556: in ACC it stays pressable and explains why it cannot run, without applying anything.
    expect(source).toMatch(/if \(quickPanelPressureState\.value\.state !== 'ready'\) \{\s*showVoicePointNotice\(t\('controlK\.notices\.fixPressures', \{ guidance: dryPressurePresentation\.value\.guidance \}\), 'error'\)\s*return\s*\}/)
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
      order(".quick-panel-section[data-quick-panel-section='references']"), order(".quick-panel-section[data-quick-panel-section='voice']"),
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
    expect(source).toContain(`<h2 class="quick-panel-heading">{{ t('controlK.pit') }}</h2>`)
    expect(translate('it', 'controlK.pit')).toBe('Pit')
    expect(source).not.toContain('<h2 class="quick-panel-heading">Tools</h2>')
    expect(source).toContain('<small v-if="pressureBadge" class="quick-action-badge" aria-hidden="true">{{ pressureBadge }}</small>')
    // The permanent pressure line is gone from view; screen readers keep it.
    expect(source).toContain('<p id="pressure-action-status" class="quick-panel-visually-hidden">')
    expect(source).toMatch(/<p v-if="pressureOutcome" class="launcher-hint quick-panel-pressure-status"/)
    expect(source).toContain("if (actionId === 'pressure' && quickPanelPressureState.value.state !== 'ready') return t('controlK.pressureHint', { guidance: dryPressurePresentation.value.guidance })")
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
    expect(source).toContain('<QuickPanelLayoutToggle v-else-if="!usesAccLayout" v-show="!isNotificationsOpen"')
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
    // Outside ACC the timer closes the cycle; the ACC grid is read in visual order (PIP-556).
    expect(source).toContain('data-overlay-wheel-action="timer" :data-overlay-wheel-last="usesAccLayout ? undefined : \'\'" @click="openQuickTimer"')
    expect(selection).toContain("button.hasAttribute('data-overlay-wheel-last')")
    expect(selection).toContain('return [...ordered, ...last]')
    expect(source).toContain("actionSelection.select('pitwall'); actionSelection.refresh()")
    // A value being edited consumes the wheel first; Back leaves the timer for the panel.
    expect(source).toContain('sectorReferenceSetup.value?.handleWheelCommand?.(command)')
    // PIP-532: the notifications view is closed first, then the timer.
    // PIP-556: then the voice alerts view.
    expect(source).toMatch(/function runBackAction\(\) \{\s*if \(isNotificationsOpen\.value\) \{ closeNotifications\(\); return \}\s*if \(isVoiceViewOpen\.value\) \{ closeVoiceView\(\); return \}\s*if \(isQuickTimerOpen\.value\) \{ leaveQuickTimer\(\); return \}/)
    expect(source).toContain("function openFuelSetup() { isFuelSetupOpen.value = true; void nextTick(() => actionSelection.select(usesAccLayout.value ? 'fuel-minutes' : 'fuel-plus')) }")
    expect(source).toContain("selectedWheelActionId.value = 'target-time'")
    expect(source).toContain("<span>{{ t('controlK.targetLap') }}</span>")
    expect(source).toContain("<span>{{ t('controlK.sectorTargets') }}</span>")
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
    // The bell sits next to the timer and, outside ACC, only exists while there is
    // something to read; the ACC grid keeps its place, disabled when empty (PIP-556).
    const timer = source.indexOf('data-overlay-wheel-action="timer"')
    const bell = source.indexOf('data-overlay-wheel-action="notifications"')
    expect(bell).toBeGreaterThan(timer)
    expect(source).toContain('v-if="(usesAccLayout || notificationCount > 0) && !isNotificationsOpen"')
    expect(source).toContain(':disabled="notificationCount === 0"')
    // Open view hides the buttons; X / wheel Back closes it; a new error opens it.
    expect(source).toContain(":class=\"{ 'quick-panel-main--behind-notifications': isNotificationsOpen }\"")
    expect(styles).toContain('.quick-panel-main--behind-notifications { display: none !important; }')
    expect(source).toMatch(/function runBackAction\(\) \{\s*if \(isNotificationsOpen\.value\) \{ closeNotifications\(\); return \}/)
    // PIP-556: Notifiche never opens by itself; viewing it marks errors as read.
    const count = source.slice(source.indexOf('function countNotifications()'), source.indexOf('function openNotifications()'))
    expect(count).not.toContain('openNotifications()')
    expect(count).toContain('if (isNotificationsOpen.value) visibleNotifications.forEach(item => seenNotifications.add(item.key))')
    // Read outcomes leave on close; "Svuota" clears what does not wait for a decision.
    expect(source).toMatch(/function closeNotifications\(\) \{[\s\S]{0,300}?clearNotifications\(\['info'\]\)/)
    expect(source).toContain(`data-overlay-wheel-action="notifications-clear" @click="clearNotifications(['info', 'error'])"`)
    expect(source).toContain('data-overlay-wheel-action="notifications-close" @click="closeNotifications"')
    // The lap badge remains available on the always-visible Pressioni button.
    expect(source).toContain('v-if="pressureBadge"')
  })
  it('PIP-533: voice buttons show and change the alert for the session being driven', () => {
    expect(source).toContain(':coach="isFullQuickPanelPreview || coachVoiceOn"')
    expect(source).toContain(':references="isFullQuickPanelPreview || referencesVoiceOn"')
    expect(source).toContain(':pressure="isFullQuickPanelPreview || pressureVoiceOn"')
    expect(source).toContain(":session-label=\"isFullQuickPanelPreview ? t('controlK.session.race') : voiceSessionLabel\"")
    // Unknown session (menus): nothing to toggle.
    expect(source).toContain(':disabled="!isFullQuickPanelPreview && (!canUseSpotterControls || !voiceSessionMode)"')
    expect(source).toContain('const next = toggleCurrentSessionMode(modes, voiceSessionType(fastState.value), on)')
    // The training voice follows the same effective lap-time alert.
    expect(source).toContain('() => coachVoiceOn.value,')
    // Computed before any consumer reads it (training orchestrator setup).
    expect(source.indexOf('const coachVoiceOn = computed')).toBeLessThan(source.indexOf('() => coachVoiceOn.value,'))
  })
  it('shows a waiting placeholder instead of partial tools when no simulator is detected', () => {
    // PIP-657: the note sits in the header right of the logo, where the layout switch was; no timer while waiting.
    expect(source).toContain(`<p v-if="waitingForSimulator" class="quick-panel-waiting quick-panel-waiting--header" role="status">{{ simulatorPresence.choiceRequired.value ? t('controlK.chooseGame') : t('controlK.waiting') }}</p>`)
    expect([translate('it', 'controlK.waiting'), translate('it', 'controlK.chooseGame')]).toEqual(['In attesa del simulatore', 'Scegli il gioco nella webapp'])
    expect(translate('en', 'controlK.waiting')).toBe('Waiting for the simulator')
    expect(source).toContain('<QuickPanelLayoutToggle v-else-if="!usesAccLayout"')
    expect(source).toContain('<button v-if="!waitingForSimulator" type="button" class="launcher-tool-button quick-panel-timer"')
    expect(source).toContain('<div v-if="!waitingForSimulator" class="quick-panel-main"')
    expect(styles).toContain('.launcher-tools__header:has(.quick-panel-waiting--header)')
    expect(source).toMatch(/const waitingForSimulator = computed\(\(\) => !isFullQuickPanelPreview\.value\s*&& simulatorPresence\.gameId\.value !== 'synthetic'\s*&& !quickPanelSupport\.value\.quickVoiceControls && !quickPanelSupport\.value\.quickAutomations\)/)
    // PIP-510: the layout follows the game from the menus on, through useSimulatorPresence.
    expect(source).toContain('const support = computed(() => gameUiSupport(simulatorPresence.gameId.value))')
    expect(styles).toContain('.training-overlay--launcher .quick-panel-waiting {')
  })
})

// PIP-556: ACC single layout contract (Pausa grid, Guida row, views, status line).
describe('ACC Control K single layout (PIP-556)', () => {
  const acc = styles.slice(styles.indexOf('// ─── PIP-556: ACC Control K'))
  it('Pausa is a fixed two-row grid with every command in a fixed place, plus one status line', () => {
    expect(acc).toContain("'logo est cor fmin fses pit'")
    expect(acc).toContain("'logo tgt sec voice timer bell'")
    expect(acc).toContain("'status status status status status status'")
    expect(acc).toMatch(/\.ck-status \{[\s\S]{0,200}?height: 20px;[\s\S]{0,120}?white-space: nowrap;/)
    // Notifications: one whole card at a time, the height follows the card.
    expect(acc).toContain('.quick-panel-notifications__body :is([hidden], [data-ck-offpage]) { display: none !important; }')
    expect(source).toContain("element.toggleAttribute('data-ck-offpage', usesAccLayout.value && index !== notificationPage.value)")
  })
  it('Guida keeps Pitwall, Correggi pressioni and the alerts; Riferimenti, Target and the bell only when useful', () => {
    const drive = acc.slice(acc.indexOf('.launcher-tools.ck.ck--drive {'))
    expect(drive.length).toBeLessThan(acc.length)
    expect(drive).toMatch(/:is\(\.pressure-test__button, \.fuel-open, \.quick-reference, \.ck-voice-alerts, \.ck-view-close,\s*\.quick-panel-timer, \.quick-panel-dev\) \{ display: none; \}/)
    // The Racer Core mark stays while driving.
    expect(drive).toContain('.quick-panel-logo { order: 0; width: 40px; height: 20px;')
    expect(drive).toContain("&.ck--no-track-references [data-overlay-wheel-action='references']")
    expect(drive).toContain("&.ck--no-target [data-overlay-wheel-action='target-voice']")
    expect(drive).toContain('&.ck--no-notifications .quick-panel-notifications-button')
    expect(drive).toContain('.ck-status--empty { display: none; }')
    expect(source).toContain("'ck--no-target': !isFullQuickPanelPreview.value && !infoTargetActive.value")
    expect(source).toContain("'ck--no-track-references': !isFullQuickPanelPreview.value && trackVoiceReferences.available.value === false")
  })
  it('editors keep the logo column, so their ← never sits under the placement lock', () => {
    expect(source).toContain(`<div v-else :class="usesAccLayout ? 'ck-shell' : 'ck-shell--plain'">`)
    expect(source).toContain('<img v-if="usesAccLayout" class="quick-panel-logo ck-shell__logo"')
    expect(acc).toContain('.ck-shell { display: grid; grid-template-columns: 56px minmax(0, 1fr); column-gap: $ck-gap;')
    // Same height as the grid logo: centred on the two rows of commands.
    expect(acc).toContain('margin-top: (2 * $ck-cell + $ck-gap - 24px) * .5;')
    expect(styles).toContain('.ck-shell--plain { display: contents; }')
    // Avvisi and Notifiche anchor the mark at the grid height too.
    expect(acc).toContain('.quick-panel-logo { align-self: start; margin-top: (2 * $ck-cell + $ck-gap - 24px) * .5; }')
  })
  it('views replace the commands inside the same two rows instead of stretching the frame', () => {
    expect(acc).toMatch(/\.quick-panel-notifications \{\s*grid-area: 1 \/ 2 \/ 3 \/ -1;[\s\S]{0,80}?height: 2 \* \$ck-cell \+ \$ck-gap;/)
    expect(acc).toContain('&.overlay-content--target { width: $ck-width; }')
    expect(source).toContain('data-overlay-wheel-action="voice-alerts" @click="openVoiceView"')
    expect(source).toContain('data-overlay-wheel-action="voice-close" @click="closeVoiceView"')
  })
  it('the context comes from the shared resolver and the status from one priority list', () => {
    // Through the settling tracker: weak force-feedback evidence cannot flicker the layout.
    expect(source).toContain("const controlKContextTracker = createControlKContextTracker('pause')")
    expect(source).toContain('controlKContext.value = controlKContextTracker.update({')
    expect(source).toContain('const controlKStatus = computed<ControlKStatusMessage | null>(() => pickControlKStatus([')
    expect(source).toContain(':status-line="usesAccLayout" @status="onPressureTestStatus" @outcome="onPressureTestOutcome"')
    // The applied or blocked correction leaves Notifiche.
    expect(source).toContain("&& !['completed', 'blocked'].includes(quickPanelPressureState.value.state)")
  })
})
