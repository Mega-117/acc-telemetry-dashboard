<script setup lang="ts">
// PIP-571 / PIP-612: the key setup of the introduction: assign the menu keys (Ctrl+K menu), then try them.
// Wheel: choose, assign five buttons one at a time (one big question per screen, like the Steam
// controller setup: press the button and it moves on by itself), practise on a faithful copy of the panel
// (test mode: the game receives nothing). Keyboard: press the real Ctrl+K twice; the copy
// mirrors the real panel opening. "Lo faccio dopo" postpones and the next launch asks again.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import OnboardingPanelReplica from '~/components/onboarding/OnboardingPanelReplica.vue'
import { useKeyboardCapture } from '~/composables/useKeyboardCapture'
import { useWheelInputBridge } from '~/composables/useWheelInputBridge'
import { canBeginAutoCapture, commandErrorText } from '~/services/controls/commandCapture'
import { formatWheelBinding, type WheelBinding, type WheelControlAction } from '~/services/controls/wheelBindingModel'
import {
  applyKeyboardClick,
  applyKeyboardVisibility,
  applyPracticePress,
  initialKeyboardPractice,
  initialPractice,
  keyboardPracticeDone,
  PRACTICE_TILES,
  practiceDone,
  practiceHint,
  practiceTasks,
} from '~/services/onboarding/commandPractice'
import { useI18n, type TranslationKey } from '~/i18n'

const props = defineProps<{ wheelAvailable: boolean }>()
// done carries the name of the key that opens the menu, shown on the last screen.
const emit = defineEmits<{ done: [menuKey?: string]; later: [] }>()
const { t } = useI18n()

type Screen = 'assign' | 'practice' | 'ready' | 'keyboard'
// PIP-612: no question and no device choice first. The screen is the list "command -> key"
// and its first row is already waiting: any button of any device (wheel, button box,
// keyboard) fills it. Next to it the menu copy shows what the command does.
// Indietro is optional: without it the first button still closes the menu.
// title/does are dictionary keys (onboarding.commands.actions), shown through t().
const REQUIRED: Array<{ id: WheelControlAction; title: TranslationKey; does: TranslationKey; optional?: true }> = [
  { id: 'togglePalette', title: 'onboarding.commands.actions.togglePalette', does: 'onboarding.commands.actions.togglePaletteDoes' },
  { id: 'nextAction', title: 'onboarding.commands.actions.nextAction', does: 'onboarding.commands.actions.nextActionDoes' },
  { id: 'previousAction', title: 'onboarding.commands.actions.previousAction', does: 'onboarding.commands.actions.previousActionDoes' },
  { id: 'activateAction', title: 'onboarding.commands.actions.activateAction', does: 'onboarding.commands.actions.activateActionDoes' },
  { id: 'mainMenu', title: 'onboarding.commands.actions.mainMenu', does: 'onboarding.commands.actions.mainMenuDoes', optional: true },
]
const STEP_SAVED_MS = 900
const PRACTICE_DONE_MS = 900
// Nothing heard for this long while waiting: say what to check instead of leaving silence.
const QUIET_MS = 8000

const bridge = useWheelInputBridge()
const { state, testedActions } = bridge
const { keyHint, reset: resetKeyCapture } = useKeyboardCapture(bridge)

const screen = ref<Screen>(props.wheelAvailable ? 'assign' : 'keyboard')
const assignIndex = ref(0)
const autoArmed = ref(false)
const saved = ref(false)
const error = ref('')
const practice = ref(initialPractice())
const skipped = ref<WheelControlAction[]>([])
const timers = new Set<ReturnType<typeof setTimeout>>()
const later = (fn: () => void, ms: number) => { const t = setTimeout(() => { timers.delete(t); fn() }, ms); timers.add(t) }
// A step the pilot leaves (Indietro, Rifai) must not be advanced later by its own pending timer.
function cancelPending() { for (const t of timers) clearTimeout(t); timers.clear() }

const current = computed(() => REQUIRED[assignIndex.value]!)
const currentBinding = computed(() => state.value.bindings[current.value.id])
const waiting = computed(() => state.value.capture?.action === current.value.id)
// One name per device model: two readers of the same wheel are one wheel for the pilot.
const controllers = computed(() => [...new Set(state.value.devices.filter(d => d.kind !== 'keyboard').map(d => d.deviceLabel))])
const readerStatus = computed(() => {
  if (!state.value.available) return t('onboarding.commands.reader.starting')
  if (state.value.inputStatus === 'starting') return t('onboarding.commands.reader.searching')
  if (state.value.inputStatus === 'unavailable') return t('onboarding.commands.reader.unavailable')
  return ''
})
const stepNumber = computed(() => ({ keyboard: 1, assign: 1, practice: 2, ready: 2 } as const)[screen.value])
const steps = computed(() => screen.value === 'keyboard' ? [t('onboarding.commands.stepTry')] : [t('onboarding.commands.stepAssign'), t('onboarding.commands.stepTry')])

// What the menu copy next to the list shows for the command being assigned.
const demo = ref<{ open: boolean, selected: number | null, confirmed: number | null }>({ open: true, selected: 0, confirmed: null })
let demoTimer: ReturnType<typeof setInterval> | null = null
function playDemo() {
  if (demoTimer) clearInterval(demoTimer)
  const id = current.value.id
  demo.value = { open: true, selected: id === 'previousAction' ? 3 : 0, confirmed: null }
  demoTimer = setInterval(() => {
    const d = demo.value, tiles = PRACTICE_TILES.length
    if (id === 'togglePalette') demo.value = { ...d, open: !d.open }
    else if (id === 'nextAction') demo.value = { ...d, selected: ((d.selected ?? 0) + 1) % tiles }
    else if (id === 'previousAction') demo.value = { ...d, selected: ((d.selected ?? 0) - 1 + tiles) % tiles }
    else if (id === 'activateAction') demo.value = { ...d, selected: 1, confirmed: d.confirmed === null ? 1 : null }
    else demo.value = { ...d, confirmed: null, open: !d.open }
  }, 1100)
}
function stopDemo() { if (demoTimer) clearInterval(demoTimer); demoTimer = null }
watch(() => screen.value === 'assign' && current.value.id, active => { if (active) playDemo(); else stopDemo() }, { immediate: true })

// Keyboard path: practise on the REAL panel. The page only hears that it was shown/hidden.
type VisibilityApi = { onTrainingOverlayVisibility?: (cb: (p: { visible?: boolean }) => void) => () => void }
const visibilityApi = (): VisibilityApi | undefined => (typeof window === 'undefined' ? undefined : (window as Window & { electronAPI?: VisibilityApi }).electronAPI)
const keyboardPractice = ref(initialKeyboardPractice())
const kbSelected = ref<number | null>(0)
const kbConfirmed = ref<number | null>(null)
function onKeyboardConfirm(index: number) {
  kbSelected.value = index
  kbConfirmed.value = index
  keyboardPractice.value = applyKeyboardClick(keyboardPractice.value)
}
const keyboardPracticeSupported = computed(() => props.wheelAvailable && !!visibilityApi()?.onTrainingOverlayVisibility)
const keyboardDone = computed(() => !keyboardPracticeSupported.value || keyboardPracticeDone(keyboardPractice.value))
let stopVisibility: (() => void) | null = null
function chooseKeyboard() {
  cancelPending()
  if (state.value.capture) void bridge.cancelCapture()
  screen.value = 'keyboard'
  keyboardPractice.value = initialKeyboardPractice()
  if (!stopVisibility && keyboardPracticeSupported.value) {
    stopVisibility = visibilityApi()!.onTrainingOverlayVisibility!((payload) => {
      if (screen.value === 'keyboard') keyboardPractice.value = applyKeyboardVisibility(keyboardPractice.value, payload?.visible === true)
    })
  }
}

// PIP-612: the classic key-binding list (games, Steam). The cursor goes by itself only to
// rows still empty; a row that has a key changes when clicked ("premi il nuovo tasto",
// Esc cancels); with every row set there is one action, Continua.
const isOpen = (index: number) => !state.value.bindings[REQUIRED[index]!.id] && !skipped.value.includes(REQUIRED[index]!.id)
function nextOpen(after: number): number {
  for (let step = 1; step <= REQUIRED.length; step++) {
    const index = (after + step) % REQUIRED.length
    if (isOpen(index)) return index
  }
  return -1
}
const allSet = computed(() => REQUIRED.every((_, index) => !isOpen(index)))
/** The button alone ("Pulsante 26", "F5"): the device name goes on a second, smaller line. */
const keyName = (binding: WheelBinding | null | undefined) => binding ? binding.buttonLabel || t('onboarding.commands.button', { n: binding.button + 1 }) : ''
const rebinding = ref(false)
function startAssign() {
  const first = nextOpen(-1)
  enterAction(first >= 0 ? first : 0, false)
}
function chooseWheel() { screen.value = 'assign'; startAssign() }
function enterAction(index: number, force = false) {
  cancelPending()
  if (state.value.capture && state.value.capture.action !== REQUIRED[index]!.id) void bridge.cancelCapture()
  assignIndex.value = index
  error.value = ''
  saved.value = false
  resetKeyCapture()
  rebinding.value = force && !!state.value.bindings[REQUIRED[index]!.id]
  autoArmed.value = force || isOpen(index)
  armCapture()
}
/** A click on a row: give that command a (new) key. The row already listening stays as it is. */
function pickRow(index: number) {
  if (index === assignIndex.value && waiting.value) return
  enterAction(index, true)
}
let bindingBefore = ''
const bindingKey = (action: WheelControlAction) => JSON.stringify(state.value.bindings[action] ?? null)
// While the "Lo faccio dopo" confirmation is open nothing listens: its keys are its own.
const paused = ref(false)
function pause() { paused.value = true; cancelPending(); if (state.value.capture) void bridge.cancelCapture() }
function resume() { paused.value = false; if (screen.value === 'assign') enterAction(assignIndex.value, rebinding.value) }
function armCapture() {
  if (screen.value !== 'assign' || paused.value || !autoArmed.value || saved.value || waiting.value) return
  if (!canBeginAutoCapture(state.value, bridge.testMode.value)) return
  autoArmed.value = false
  bindingBefore = bindingKey(current.value.id)
  void bridge.beginCapture(current.value.id)
}
function retry() { error.value = ''; autoArmed.value = true; armCapture() }
function skip() {
  if (state.value.capture) void bridge.cancelCapture()
  if (!skipped.value.includes(current.value.id)) skipped.value = [...skipped.value, current.value.id]
  goNextAction()
}
// After a key: the next empty row, or the practice when none is left. A changed key
// (row clicked) stays on its row: the pilot may want to change others.
function goNextAction() {
  const next = nextOpen(assignIndex.value)
  if (next >= 0) enterAction(next)
  else if (!rebinding.value) startPractice()
  else { rebinding.value = false; saved.value = false }
}

const quiet = ref(false)
let quietTimer: ReturnType<typeof setTimeout> | null = null
watch(waiting, (now) => {
  if (quietTimer) clearTimeout(quietTimer)
  quiet.value = false
  quietTimer = now ? setTimeout(() => { quiet.value = true }, QUIET_MS) : null
})

// Readers come up a moment after the bridge starts: arm as soon as capture is possible.
watch(() => [state.value.available, state.value.inputStatus, state.value.devices.length, state.value.capture], () => armCapture())

// End of a capture for the current command: saved -> tick and move on, otherwise explain.
// A capture that starts late, once the pilot already left the list (keyboard path,
// practice) or paused it, would catch keys meant for something else: drop it.
watch(() => state.value.capture, (now) => {
  if (now && (screen.value !== 'assign' || paused.value)) void bridge.cancelCapture()
})
watch(() => state.value.capture, (now, before) => {
  if (screen.value !== 'assign' || paused.value || now || before?.action !== current.value.id) return
  const action = current.value.id
  const changed = bindingKey(action) !== bindingBefore || state.value.operation?.saved === true
  if (state.value.bindings[action] && !state.value.operation?.reason && changed) {
    saved.value = true
    later(() => { saved.value = false; goNextAction() }, STEP_SAVED_MS)
  } else if (state.value.bindings[action] && !state.value.operation?.reason) {
    // Esc while changing a key: the old key stays, nothing to explain; the cursor goes back
    // to the first row still empty (or to Continua when there is none).
    rebinding.value = false
    const next = nextOpen(-1)
    if (next >= 0) enterAction(next)
  } else {
    error.value = commandErrorText(state.value.operation?.reason || state.value.lastError) || t('onboarding.commands.noKey')
  }
})

// Practise only what was assigned: no Indietro button, no Indietro exercise.
const tasks = computed(() => practiceTasks(!!state.value.bindings.mainMenu))
function startPractice() {
  screen.value = 'practice'
  practice.value = initialPractice()
  bridge.setTestMode(true)
}
function restartAssign() { bridge.setTestMode(false); screen.value = 'assign'; startAssign() }
watch(() => [...testedActions.value], (now, before) => {
  if (screen.value !== 'practice') return
  for (const action of now) {
    if (before?.includes(action)) continue
    practice.value = applyPracticePress(practice.value, action, tasks.value)
  }
  if (practiceDone(practice.value, tasks.value)) {
    bridge.setTestMode(false)
    later(() => { screen.value = 'ready' }, PRACTICE_DONE_MS)
  }
})
const hint = computed(() => practiceHint(practice.value, tasks.value))

// PIP-612: "Lo faccio dopo" and its confirmation live in the corner of the introduction,
// where "Salta" is; the introduction calls postpone once the pilot confirms.
function postpone() { void release(); emit('later') }
defineExpose({ postpone, pause, resume })
function finish() {
  const key = screen.value !== 'keyboard' && state.value.bindings.togglePalette ? formatWheelBinding(state.value.bindings.togglePalette) : undefined
  void release(); emit('done', key)
}
async function release() {
  cancelPending()
  stopDemo()
  if (quietTimer) clearTimeout(quietTimer)
  stopVisibility?.(); stopVisibility = null
  await bridge.finishConfiguration()
}

// The first row waits for a key as soon as the readers are up (armCapture follows them).
onMounted(() => { if (props.wheelAvailable) { void bridge.start(); startAssign() } })
onBeforeUnmount(() => { void release() })
</script>

<template>
  <section class="cmd" :aria-label="t('onboarding.commands.aria')">
    <!-- Sub-steps only when there is more than one (the keyboard path has just the trial). -->
    <header v-if="steps.length > 1" class="cmd__head">
      <ol class="cmd__steps" :aria-label="t('onboarding.commands.stepsAria')">
        <li v-for="(label, i) in steps" :key="label" :class="{ on: stepNumber === i + 1, done: stepNumber > i + 1 }">{{ i + 1 }} {{ label }}</li>
      </ol>
    </header>

    <Transition name="cmd-swap" mode="out-in">
    <!-- 1. Assegna: the list "command -> key", the first row already waits; the menu copy shows what it does -->
    <div v-if="screen === 'assign'" class="cmd__screen cmd__screen--assign" data-cmd-screen="assign">
      <div class="cmd__assign">
        <h2 class="cmd__title">{{ t('onboarding.commands.assignTitle') }} <em>{{ t('onboarding.commands.assignAccent') }}</em></h2>
        <p class="cmd__lead">{{ t('onboarding.commands.assignLead') }}</p>
        <ol class="cmd__binds" :aria-label="t('onboarding.commands.bindsAria')">
          <li v-for="(item, i) in REQUIRED" :key="item.id" :data-slot="item.id"
            :class="{ now: i === assignIndex, done: !!state.bindings[item.id] || i === assignIndex && saved, skip: skipped.includes(item.id) && !state.bindings[item.id] }">
            <button type="button" class="cmd__bind" :title="state.bindings[item.id] ? t('onboarding.commands.clickToChange') : undefined" @click="pickRow(i)">
              <span class="cmd__bind-name">{{ t(item.title) }}<small v-if="item.optional"> · {{ t('onboarding.commands.optional') }}</small></span>
              <span class="cmd__bind-key" :class="{ 'is-wait': i === assignIndex && waiting }">
                <template v-if="i === assignIndex && waiting">{{ keyHint || t('onboarding.commands.pressKey') }}</template>
                <!-- The button first, readable at a glance; the device below, small. -->
                <template v-else-if="state.bindings[item.id]"><b>✓ {{ keyName(state.bindings[item.id]) }}</b><small>{{ state.bindings[item.id]!.deviceLabel }}</small></template>
                <template v-else-if="skipped.includes(item.id)">{{ t('onboarding.commands.notNeeded') }}</template>
                <template v-else>—</template>
              </span>
            </button>
          </li>
        </ol>
        <div class="cmd__assign-status">
          <p v-if="waiting && quiet" class="cmd__wizard-hint is-quiet" data-cmd-ask>{{ t('onboarding.commands.quiet') }}</p>
          <p v-else-if="waiting && rebinding" class="cmd__wizard-hint cmd__wizard-hint--soft" data-cmd-ask>{{ t('onboarding.commands.rebind', { command: t(current.title) }) }}</p>
          <!-- Plain waiting needs no words: the row blinks and the menu copy shows what it does. -->
          <span v-else-if="waiting" data-cmd-ask />

          <template v-else-if="error">
            <p class="cmd__wizard-hint is-quiet" role="alert">{{ error }}</p>
            <button type="button" class="cmd__primary" data-cmd-retry @click="retry">{{ t('common.retry') }}</button>
          </template>
          <!-- Every row has a key: one action, and the rows stay clickable to change one. -->
          <div v-else-if="allSet && !saved" class="cmd__row cmd__row--start cmd__ready-row">
            <button type="button" class="cmd__primary" data-cmd-continue @click="startPractice">{{ t('onboarding.commands.continue') }}</button>
            <span class="cmd__note">{{ t('onboarding.commands.changeNote') }}</span>
          </div>
          <p v-else-if="!saved" class="cmd__wizard-hint cmd__wizard-hint--soft">{{ readerStatus || t('onboarding.commands.moment') }}</p>
          <button v-if="current.optional && !currentBinding && !saved && !skipped.includes(current.id)" type="button" class="cmd__link" data-cmd-skip @click="skip">{{ t('onboarding.commands.skip') }}</button>
        </div>
        <!-- A real way out for who drives without wheel or button box: the menu works with Ctrl+K. -->
        <div class="cmd__alt">
          <span>{{ t('onboarding.commands.noWheel') }}</span>
          <button type="button" class="cmd__ghost" data-cmd-keyboard @click="chooseKeyboard">{{ t('onboarding.commands.useKeyboard') }}</button>
        </div>
      </div>
      <div class="cmd__mock" data-cmd-demo>
        <OnboardingPanelReplica v-if="demo.open" :selected="demo.selected" :confirmed="demo.confirmed" :status="t(current.does)" />
        <div v-else class="cmd__closed">{{ t('onboarding.commands.menuClosed') }}</div>
      </div>
    </div>

    <!-- 3. Prova il pannello -->
    <div v-else-if="screen === 'practice'" class="cmd__screen cmd__screen--practice" data-cmd-screen="practice">
      <div class="cmd__tasks">
        <h2 class="cmd__title">{{ t('onboarding.commands.tryTitle') }} <em>{{ t('onboarding.commands.tryAccent') }}</em></h2>
        <p class="cmd__lead">{{ t('onboarding.commands.tryLead') }}</p>
        <ol class="cmd__tasklist">
          <li v-for="(task, i) in tasks" :key="task.id" :class="{ done: i < practice.task, now: i === practice.task }" :data-task="task.id">
            <span class="cmd__tick" aria-hidden="true">{{ i < practice.task ? '✓' : i + 1 }}</span>
            {{ t(`onboarding.commands.tasks.${task.id}`) }}<template v-if="task.times > 1 && i === practice.task"> ({{ practice.count }}/{{ task.times }})</template>
          </li>
        </ol>
        <p v-if="hint" class="cmd__hint" role="status">{{ hint }}</p>
      </div>
      <div class="cmd__mock" :class="{ 'is-open': practice.open }" data-cmd-mock>
        <OnboardingPanelReplica
          v-if="practice.open"
          :selected="practice.selected"
          :confirmed="practice.confirmed"
          :status="practice.confirmed !== null ? t('onboarding.commands.confirmed', { tile: PRACTICE_TILES[practice.confirmed] ?? '' }) : undefined"
          @select="practice = { ...practice, selected: $event }"
          @confirm="practice = { ...practice, selected: $event, confirmed: $event }"
        />
        <div v-else class="cmd__closed">{{ t('onboarding.commands.menuClosed') }}</div>
      </div>
    </div>

    <!-- Fatto -->
    <div v-else-if="screen === 'ready'" class="cmd__screen" data-cmd-screen="ready">
      <h2 class="cmd__title"><span class="cmd__check" aria-hidden="true">✓</span> {{ t('onboarding.commands.readyTitle') }} <em>{{ t('onboarding.commands.readyAccent') }}</em></h2>
      <ul class="cmd__summary">
        <li v-for="item in REQUIRED" :key="item.id"><span>{{ t(item.title) }}</span><b :class="{ off: !state.bindings[item.id] }">{{ formatWheelBinding(state.bindings[item.id]) }}</b></li>
      </ul>
      <p class="cmd__lead">{{ t('onboarding.commands.changeLater') }}</p>
      <button type="button" class="cmd__primary cmd__primary--big" data-cmd-finish @click="finish">{{ t('onboarding.next') }}</button>
    </div>

    <!-- Solo tastiera e mouse -->
    <div v-else class="cmd__screen cmd__screen--practice" data-cmd-screen="keyboard">
      <div class="cmd__tasks">
        <h2 class="cmd__title">{{ t('onboarding.commands.tryTitle') }} <em>{{ t('onboarding.commands.tryAccent') }}</em></h2>
        <p class="cmd__lead">{{ t('onboarding.commands.kbLead') }}</p>
        <ol v-if="keyboardPracticeSupported" class="cmd__tasklist">
          <li :class="{ done: keyboardPractice.opened, now: !keyboardPractice.opened }" data-task="kb-open">
            <span class="cmd__tick" aria-hidden="true">{{ keyboardPractice.opened ? '✓' : 1 }}</span>
            {{ t('onboarding.commands.kbOpen') }}
          </li>
          <li :class="{ done: keyboardPractice.clicked, now: keyboardPractice.opened && !keyboardPractice.clicked }" data-task="kb-click">
            <span class="cmd__tick" aria-hidden="true">{{ keyboardPractice.clicked ? '✓' : 2 }}</span>
            {{ t('onboarding.commands.kbClick') }}
          </li>
          <li :class="{ done: keyboardPractice.closed, now: keyboardPractice.clicked && !keyboardPractice.closed }" data-task="kb-close">
            <span class="cmd__tick" aria-hidden="true">{{ keyboardPractice.closed ? '✓' : 3 }}</span>
            {{ t('onboarding.commands.kbClose') }}
          </li>
        </ol>
        <p class="cmd__note">{{ t('onboarding.commands.kbNote') }}</p>
        <div class="cmd__row cmd__row--start">
          <button type="button" class="cmd__primary cmd__primary--big" :disabled="!keyboardDone" data-cmd-finish @click="finish">{{ t('onboarding.commands.gotIt') }}</button>
          <button v-if="wheelAvailable" type="button" class="cmd__ghost" data-cmd-wheel @click="chooseWheel">{{ t('onboarding.commands.haveWheel') }}</button>
        </div>
      </div>
      <div class="cmd__mock cmd__mock--screen" :class="{ 'is-open': keyboardPractice.open }" data-cmd-kb-mock>
        <OnboardingPanelReplica
          v-if="keyboardPractice.open || !keyboardPracticeSupported"
          :selected="kbSelected"
          :confirmed="kbConfirmed"
          :status="kbConfirmed !== null ? t('onboarding.commands.chosen', { tile: PRACTICE_TILES[kbConfirmed] ?? '' }) : t('onboarding.commands.thisOne')"
          @select="kbSelected = $event"
          @confirm="onKeyboardConfirm"
        />
        <div v-else class="cmd__keys" aria-hidden="true"><kbd>Ctrl</kbd><span>+</span><kbd>K</kbd></div>
        <p class="cmd__kb-status" role="status">
          <template v-if="!keyboardPracticeSupported">{{ t('onboarding.commands.kbAnyTime') }}</template>
          <template v-else-if="keyboardDone">{{ t('onboarding.commands.kbDone') }}</template>
          <template v-else-if="keyboardPractice.open && !keyboardPractice.clicked">{{ t('onboarding.commands.kbOpened') }}</template>
          <template v-else-if="keyboardPractice.open">{{ t('onboarding.commands.kbAgain') }}</template>
          <template v-else-if="keyboardPractice.opened">{{ t('onboarding.commands.kbReopen') }}</template>
          <template v-else>{{ t('onboarding.commands.kbNow') }}</template>
        </p>
      </div>
    </div>
    </Transition>

    <footer v-if="wheelAvailable && (screen === 'keyboard' || screen === 'practice')" class="cmd__foot">
      <button v-if="screen === 'keyboard'" type="button" class="cmd__back" data-cmd-back @click="chooseWheel">{{ t('onboarding.previous') }}</button>
      <button v-else type="button" class="cmd__back" data-cmd-reassign @click="restartAssign">{{ t('onboarding.commands.reassign') }}</button>
    </footer>
  </section>
</template>

<style src="../../assets/scss/components/onboarding-commands.scss" lang="scss" scoped></style>
