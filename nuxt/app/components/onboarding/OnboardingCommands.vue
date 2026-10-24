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

const props = defineProps<{ wheelAvailable: boolean }>()
// done carries the name of the key that opens the menu, shown on the last screen.
const emit = defineEmits<{ done: [menuKey?: string]; later: [] }>()

type Screen = 'assign' | 'practice' | 'ready' | 'keyboard'
// PIP-612: no question and no device choice first. The screen is the list "command -> key"
// and its first row is already waiting: any button of any device (wheel, button box,
// keyboard) fills it. Next to it the menu copy shows what the command does.
// Indietro is optional: without it the first button still closes the menu.
const REQUIRED: Array<{ id: WheelControlAction; title: string; does: string; optional?: true }> = [
  { id: 'togglePalette', title: 'Apri e chiudi il menu', does: 'Apre il menu in pista.' },
  { id: 'nextAction', title: 'Voce successiva', does: 'Sposta la selezione avanti.' },
  { id: 'previousAction', title: 'Voce precedente', does: 'Sposta la selezione indietro.' },
  { id: 'activateAction', title: 'Conferma', does: 'Attiva la voce selezionata.' },
  { id: 'mainMenu', title: 'Indietro', does: 'Esce dalla voce aperta.', optional: true },
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
  if (!state.value.available) return 'Collegamento ai comandi in avvio…'
  if (state.value.inputStatus === 'starting') return 'Cerco volante e button box…'
  if (state.value.inputStatus === 'unavailable') return 'Lettura dei comandi non disponibile: riavvia Racer Core e riprova.'
  return ''
})
const stepNumber = computed(() => ({ keyboard: 1, assign: 1, practice: 2, ready: 2 } as const)[screen.value])
const steps = computed(() => screen.value === 'keyboard' ? ['Prova'] : ['Assegna', 'Prova'])

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
const keyName = (binding: WheelBinding | null | undefined) => binding ? binding.buttonLabel || `Pulsante ${binding.button + 1}` : ''
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
/** A click on a row: give that command a (new) key. */
function pickRow(index: number) { enterAction(index, true) }
let bindingBefore = ''
const bindingKey = (action: WheelControlAction) => JSON.stringify(state.value.bindings[action] ?? null)
function armCapture() {
  if (screen.value !== 'assign' || !autoArmed.value || saved.value || waiting.value) return
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
watch(() => state.value.capture, (now, before) => {
  if (screen.value !== 'assign' || now || before?.action !== current.value.id) return
  const action = current.value.id
  const changed = bindingKey(action) !== bindingBefore || state.value.operation?.saved === true
  if (state.value.bindings[action] && !state.value.operation?.reason && changed) {
    saved.value = true
    later(() => { saved.value = false; goNextAction() }, STEP_SAVED_MS)
  } else if (state.value.bindings[action] && !state.value.operation?.reason) {
    // Esc while changing a key: the old key stays, nothing to explain; the cursor goes back
    // to the first row still empty (or to Continua when there is none).
    rebinding.value = false
    const next = nextOpen(assignIndex.value)
    if (next >= 0) enterAction(next)
  } else {
    error.value = commandErrorText(state.value.operation?.reason || state.value.lastError) || 'Nessun tasto ricevuto. Premi Riprova.'
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
defineExpose({ postpone })
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
  <section class="cmd" aria-label="Comandi del pannello">
    <!-- Sub-steps only when there is more than one (the keyboard path has just the trial). -->
    <header v-if="steps.length > 1" class="cmd__head">
      <ol class="cmd__steps" aria-label="Passi dei comandi">
        <li v-for="(label, i) in steps" :key="label" :class="{ on: stepNumber === i + 1, done: stepNumber > i + 1 }">{{ i + 1 }} {{ label }}</li>
      </ol>
    </header>

    <Transition name="cmd-swap" mode="out-in">
    <!-- 1. Assegna: the list "command -> key", the first row already waits; the menu copy shows what it does -->
    <div v-if="screen === 'assign'" class="cmd__screen cmd__screen--assign" data-cmd-screen="assign">
      <div class="cmd__assign">
        <h2 class="cmd__title">Imposta <em>i tasti</em></h2>
        <p class="cmd__lead">Premi un tasto del volante o della button box per ogni comando.</p>
        <ol class="cmd__binds" aria-label="Comandi e tasti">
          <li v-for="(item, i) in REQUIRED" :key="item.id" :data-slot="item.id"
            :class="{ now: i === assignIndex, done: !!state.bindings[item.id] || i === assignIndex && saved, skip: skipped.includes(item.id) && !state.bindings[item.id] }">
            <button type="button" class="cmd__bind" :title="state.bindings[item.id] ? 'Clicca per cambiare il tasto' : undefined" @click="pickRow(i)">
              <span class="cmd__bind-name">{{ item.title }}<small v-if="item.optional"> · facoltativo</small></span>
              <span class="cmd__bind-key" :class="{ 'is-wait': i === assignIndex && waiting }">
                <template v-if="i === assignIndex && waiting">{{ keyHint || 'premi un tasto…' }}</template>
                <!-- The button first, readable at a glance; the device below, small. -->
                <template v-else-if="state.bindings[item.id]"><b>✓ {{ keyName(state.bindings[item.id]) }}</b><small>{{ state.bindings[item.id]!.deviceLabel }}</small></template>
                <template v-else-if="skipped.includes(item.id)">non serve</template>
                <template v-else>—</template>
              </span>
            </button>
          </li>
        </ol>
        <div class="cmd__assign-status">
          <p v-if="waiting && quiet" class="cmd__wizard-hint is-quiet" data-cmd-ask>Non ricevo niente. Il volante è collegato? Prova un altro tasto.</p>
          <p v-else-if="waiting && rebinding" class="cmd__wizard-hint cmd__wizard-hint--soft" data-cmd-ask>Premi il nuovo tasto per «{{ current.title }}» · Esc annulla</p>
          <!-- Plain waiting needs no words: the row blinks and the menu copy shows what it does. -->
          <span v-else-if="waiting" data-cmd-ask />

          <template v-else-if="error">
            <p class="cmd__wizard-hint is-quiet" role="alert">{{ error }}</p>
            <button type="button" class="cmd__primary" data-cmd-retry @click="retry">Riprova</button>
          </template>
          <!-- Every row has a key: one action, and the rows stay clickable to change one. -->
          <div v-else-if="allSet && !saved" class="cmd__row cmd__row--start cmd__ready-row">
            <button type="button" class="cmd__primary" data-cmd-continue @click="startPractice">Continua</button>
            <span class="cmd__note">Clicca un comando per cambiare il suo tasto.</span>
          </div>
          <p v-else-if="!saved" class="cmd__wizard-hint cmd__wizard-hint--soft">{{ readerStatus || 'Un attimo…' }}</p>
          <button v-if="current.optional && !currentBinding && !saved && !skipped.includes(current.id)" type="button" class="cmd__link" data-cmd-skip @click="skip">Salta, non mi serve</button>
        </div>
        <!-- A real way out for who drives without wheel or button box: the menu works with Ctrl+K. -->
        <div class="cmd__alt">
          <span>Niente volante? Il menu si apre con Ctrl+K.</span>
          <button type="button" class="cmd__ghost" data-cmd-keyboard @click="chooseKeyboard">Uso tastiera e mouse</button>
        </div>
      </div>
      <div class="cmd__mock" data-cmd-demo>
        <OnboardingPanelReplica v-if="demo.open" :selected="demo.selected" :confirmed="demo.confirmed" :status="current.does" />
        <div v-else class="cmd__closed">Menu chiuso</div>
      </div>
    </div>

    <!-- 3. Prova il pannello -->
    <div v-else-if="screen === 'practice'" class="cmd__screen cmd__screen--practice" data-cmd-screen="practice">
      <div class="cmd__tasks">
        <h2 class="cmd__title">Prova <em>il menu</em></h2>
        <p class="cmd__lead">Usa i tuoi tasti. Il gioco non riceve niente.</p>
        <ol class="cmd__tasklist">
          <li v-for="(task, i) in tasks" :key="task.id" :class="{ done: i < practice.task, now: i === practice.task }" :data-task="task.id">
            <span class="cmd__tick" aria-hidden="true">{{ i < practice.task ? '✓' : i + 1 }}</span>
            {{ task.text }}<template v-if="task.times > 1 && i === practice.task"> ({{ practice.count }}/{{ task.times }})</template>
          </li>
        </ol>
        <p v-if="hint" class="cmd__hint" role="status">{{ hint }}</p>
      </div>
      <div class="cmd__mock" :class="{ 'is-open': practice.open }" data-cmd-mock>
        <OnboardingPanelReplica
          v-if="practice.open"
          :selected="practice.selected"
          :confirmed="practice.confirmed"
          :status="practice.confirmed !== null ? `Hai confermato: ${PRACTICE_TILES[practice.confirmed]} (prova)` : undefined"
          @select="practice = { ...practice, selected: $event }"
          @confirm="practice = { ...practice, selected: $event, confirmed: $event }"
        />
        <div v-else class="cmd__closed">Menu chiuso</div>
      </div>
    </div>

    <!-- Fatto -->
    <div v-else-if="screen === 'ready'" class="cmd__screen" data-cmd-screen="ready">
      <h2 class="cmd__title"><span class="cmd__check" aria-hidden="true">✓</span> Comandi <em>pronti</em></h2>
      <ul class="cmd__summary">
        <li v-for="item in REQUIRED" :key="item.id"><span>{{ item.title }}</span><b :class="{ off: !state.bindings[item.id] }">{{ formatWheelBinding(state.bindings[item.id]) }}</b></li>
      </ul>
      <p class="cmd__lead">Li cambi quando vuoi in Impostazioni → Comandi.</p>
      <button type="button" class="cmd__primary cmd__primary--big" data-cmd-finish @click="finish">Avanti</button>
    </div>

    <!-- Solo tastiera e mouse -->
    <div v-else class="cmd__screen cmd__screen--practice" data-cmd-screen="keyboard">
      <div class="cmd__tasks">
        <h2 class="cmd__title">Prova <em>il menu</em></h2>
        <p class="cmd__lead">Tieni premuto Ctrl e premi K. Si apre davvero, in alto a destra dello schermo.</p>
        <ol v-if="keyboardPracticeSupported" class="cmd__tasklist">
          <li :class="{ done: keyboardPractice.opened, now: !keyboardPractice.opened }" data-task="kb-open">
            <span class="cmd__tick" aria-hidden="true">{{ keyboardPractice.opened ? '✓' : 1 }}</span>
            Apri il menu con Ctrl+K
          </li>
          <li :class="{ done: keyboardPractice.clicked, now: keyboardPractice.opened && !keyboardPractice.clicked }" data-task="kb-click">
            <span class="cmd__tick" aria-hidden="true">{{ keyboardPractice.clicked ? '✓' : 2 }}</span>
            Clicca una voce con il mouse
          </li>
          <li :class="{ done: keyboardPractice.closed, now: keyboardPractice.clicked && !keyboardPractice.closed }" data-task="kb-close">
            <span class="cmd__tick" aria-hidden="true">{{ keyboardPractice.closed ? '✓' : 3 }}</span>
            Chiudilo con Ctrl+K
          </li>
        </ol>
        <p class="cmd__note">Per usarlo in guida col volante, imposta i tasti in Impostazioni → Comandi.</p>
        <div class="cmd__row cmd__row--start">
          <button type="button" class="cmd__primary cmd__primary--big" :disabled="!keyboardDone" data-cmd-finish @click="finish">Ho capito</button>
          <button v-if="wheelAvailable" type="button" class="cmd__ghost" data-cmd-wheel @click="chooseWheel">Ho un volante</button>
        </div>
      </div>
      <div class="cmd__mock cmd__mock--screen" :class="{ 'is-open': keyboardPractice.open }" data-cmd-kb-mock>
        <OnboardingPanelReplica
          v-if="keyboardPractice.open || !keyboardPracticeSupported"
          :selected="kbSelected"
          :confirmed="kbConfirmed"
          :status="kbConfirmed !== null ? `Hai scelto: ${PRACTICE_TILES[kbConfirmed]} (prova)` : 'È questo: lo vedi anche in alto a destra.'"
          @select="kbSelected = $event"
          @confirm="onKeyboardConfirm"
        />
        <div v-else class="cmd__keys" aria-hidden="true"><kbd>Ctrl</kbd><span>+</span><kbd>K</kbd></div>
        <p class="cmd__kb-status" role="status">
          <template v-if="!keyboardPracticeSupported">Provalo quando vuoi: Ctrl+K funziona sempre.</template>
          <template v-else-if="keyboardDone">Perfetto, sai già usarlo.</template>
          <template v-else-if="keyboardPractice.open && !keyboardPractice.clicked">Aperto. Clicca una voce qui sopra.</template>
          <template v-else-if="keyboardPractice.open">Bene. Ora premi di nuovo Ctrl+K.</template>
          <template v-else-if="keyboardPractice.opened">Riaprilo con Ctrl+K e clicca una voce.</template>
          <template v-else>Premi Ctrl+K adesso.</template>
        </p>
      </div>
    </div>
    </Transition>

    <footer v-if="wheelAvailable && (screen === 'keyboard' || screen === 'practice')" class="cmd__foot">
      <button v-if="screen === 'keyboard'" type="button" class="cmd__back" data-cmd-back @click="chooseWheel">Indietro</button>
      <button v-else type="button" class="cmd__back" data-cmd-reassign @click="restartAssign">Non funziona? Riassegna</button>
    </footer>
  </section>
</template>

<style scoped lang="scss">
// Same language as Impostazioni and Ctrl+K: square corners, thin light borders, chamfered actions.
@use '@/assets/scss/racing-settings' as controls;
$red: #e3122a;
$ok: #21ff83;
$sel: #ffd400;
$line: #ffffff40;
$chamfer: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
$ease: cubic-bezier(.22, .61, .36, 1);
.cmd { @include controls.tokens; display: flex; flex-direction: column; gap: 24px; height: 100%; box-sizing: border-box; padding: 24px 40px 18px; color: #fff; overflow: hidden; }
.cmd__head { display: flex; align-items: center; gap: 20px; }
.cmd__eyebrow { font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: #8a8a90; }
.cmd__steps { display: flex; gap: 6px; margin: 0; padding: 0; list-style: none;
  li { padding: 8px 18px; background: #ffffff10; color: #8a8a90; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; transform: skewX(-12deg); transition: background .5s ease, color .5s ease; }
  li.on { background: $red; color: #fff; animation: cmd-pop .7s $ease; }
  li.done { background: rgba($ok,.14); color: $ok; } }
@keyframes cmd-pop { 0% { transform: skewX(-12deg) scale(.9) } 60% { transform: skewX(-12deg) scale(1.04) } 100% { transform: skewX(-12deg) scale(1) } }
.cmd__screen { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 20px; }
.cmd__title { margin: 0; font: 700 34px/1.05 'Racer Display', 'Inter', sans-serif; text-transform: uppercase; em { font-style: inherit; color: $red; } }
.cmd__lead { margin: 0; max-width: 700px; font-size: 17px; line-height: 1.6; color: #c9c9ce; }
// Two equal choices: icon on top, name, one line. The wheel one keeps the red tint (recommended).
.cmd__choices { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; width: min(720px, 100%); margin-top: 12px; }
.cmd__choice { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 22px 24px 26px; border: 0; background: #ffffff0d; box-shadow: inset 0 -3px #ffffff40; color: #fff; text-align: center; cursor: pointer; clip-path: $chamfer; transition: background .4s ease, transform .4s $ease, box-shadow .4s ease;
  strong { margin-top: 6px; font-size: 20px; } span { font-size: 14px; color: #b3b3b8; }
  &:hover { background: #ffffff18; transform: translateY(-3px); box-shadow: inset 0 -3px #fff; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: -4px; } }
.cmd__choice--main { background: rgba($red,.16); box-shadow: inset 0 -3px $red; &:hover { background: rgba($red,.28); box-shadow: inset 0 -3px $red; } }
.cmd__devices { margin: 4px 0 0; max-width: 700px; font-size: 14px; color: #8a8a90; }
// Assign wizard: progress, then one centred question with the wheel; nothing else competes.
.cmd__progress { display: flex; gap: 6px; }
.cmd__seg { width: 40px; height: 6px; background: #ffffff1f; transition: background .6s ease;
  &.now { background: $sel; } &.done { background: $ok; } &.skip { background: transparent; box-shadow: inset 0 0 0 1px #8a8a90; } }
.cmd__wizard { display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center; }
.cmd__wizard-n { margin: 0; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: #b3b3b8; }
.cmd__wizard-does { margin: -6px 0 0; max-width: 620px; font-size: 17px; color: #c9c9ce; }
.cmd__wizard-icon { width: 280px; height: 158px; }
.cmd__wizard-ask { font-size: 40px; max-width: 760px; }
.cmd__wizard-hint { margin: 0; min-height: 1.5em; font-size: 18px; color: $sel; &.is-quiet { color: #ff8a8a; } b { color: #fff; } }
.cmd__wizard .cmd__ok { margin: 0; }
.cmd__link { padding: 4px 0; border: 0; background: none; color: #b3b3b8; font: 500 15px/1.4 'Inter', sans-serif; text-decoration: underline; cursor: pointer;
  &:hover { color: #fff; } &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; } }
.cmd__ok { display: inline-flex; align-items: center; gap: 14px; font-size: 20px; color: $ok; }
.cmd__check { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: $ok; color: #04150a; font-size: 24px; font-weight: 900; vertical-align: middle; }
.cmd__row { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
.cmd__primary { padding: 14px 36px 14px 28px; border: 0; border-radius: 0; background: $red; color: #fff; font: 700 15px/1 'Inter', sans-serif; text-transform: uppercase; letter-spacing: .04em; cursor: pointer; clip-path: $chamfer;
  &:hover { background: #f21a33; } &:focus-visible { outline: 2px solid #fff; outline-offset: -4px; } }
.cmd__primary--big { padding: 16px 48px 16px 36px; font: 700 20px/1 'Racer Display', 'Inter', sans-serif; }
.cmd__ghost { padding: 14px 28px 14px 22px; border: 0; background: #ffffff16; color: #fff; font: 600 14px/1 'Inter', sans-serif; cursor: pointer; clip-path: $chamfer;
  &:hover { background: #ffffff26; } &:focus-visible { outline: 2px solid #fff; outline-offset: -4px; } }
.cmd__tick { transition: background .6s ease, color .6s ease; }
.cmd__tasklist li { transition: background .6s ease, color .6s ease, box-shadow .6s ease; }
// Sub-step change and next command: the old content fades out gently, the new one glides in.
.cmd-swap-enter-active, .cmd-next-enter-active { transition: transform .6s $ease, opacity .6s ease; }
.cmd-swap-leave-active, .cmd-next-leave-active { transition: transform .45s ease-in-out, opacity .45s ease-in-out; }
.cmd-swap-enter-from { transform: translateX(28px); opacity: 0; }
.cmd-swap-leave-to { transform: translateX(-20px); opacity: 0; }
.cmd-next-enter-from { transform: translateY(14px); opacity: 0; }
.cmd-next-leave-to { transform: translateY(-10px); opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .cmd-swap-enter-from, .cmd-swap-leave-to, .cmd-next-enter-from, .cmd-next-leave-to { transform: none; }
  .cmd__steps li.on { animation: none; }
}
.cmd__back, .cmd__later { border: 0; padding: 6px 0; background: none; color: #b3b3b8; font-size: 14px; cursor: pointer; &:hover { color: #fff; text-decoration: underline; } &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; } }
.cmd__screen--practice, .cmd__screen--assign { flex-direction: row; align-items: stretch; justify-content: flex-start; text-align: left; gap: 40px; }
// PIP-612: the key list. One row per command: name on the left, its key on the right.
.cmd__assign { flex: 0 0 440px; display: flex; flex-direction: column; gap: 16px; .cmd__lead { font-size: 16px; } }
.cmd__binds { display: grid; margin: 4px 0 0; padding: 0; list-style: none; border: 1px solid $line;
  li + li { border-top: 1px solid $line; }
  li.now .cmd__bind { background: rgba($sel, .08); box-shadow: inset 4px 0 $sel; color: #fff; }
  li.done .cmd__bind-key { color: $ok; }
  li.skip .cmd__bind-key { color: #8a8a90; } }
.cmd__bind { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; min-height: 54px; padding: 0 16px; border: 0; background: none;
  color: #c9c9ce; font: 600 16px/1.2 'Inter', sans-serif; text-align: left; cursor: pointer; transition: background .3s ease;
  &:hover { background: #ffffff0d; } &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
  small { color: #8a8a90; font-weight: 500; } }
.cmd__bind-key { flex: 0 0 200px; display: grid; align-content: center; gap: 2px; min-height: 40px; box-sizing: border-box; overflow: hidden; padding: 4px 12px; border: 1px solid $line; background: #050507; color: #8a8a90; font-size: 14px; text-align: center; white-space: nowrap;
  b, small { overflow: hidden; text-overflow: ellipsis; }
  b { font-weight: 700; }
  small { color: #8a8a90; font-size: 11px; font-weight: 500; }
  &.is-wait { border-color: $sel; color: $sel; animation: cmd-wait 1.1s ease-in-out infinite; } }
@keyframes cmd-wait { 50% { border-color: rgba($sel, .25); color: rgba($sel, .6); } }
@media (prefers-reduced-motion: reduce) { .cmd__bind-key.is-wait { animation: none; } }
.cmd__assign-status { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; min-height: 44px; .cmd__wizard-hint { font-size: 16px; } }
.cmd__wizard-hint--soft { color: #c9c9ce; }
.cmd__alt { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: auto 0 0; padding-top: 14px; border-top: 1px solid $line; font-size: 14px; color: #b3b3b8; }
.cmd__tasks { flex: 0 0 380px; display: flex; flex-direction: column; gap: 18px; justify-content: flex-start; .cmd__lead { font-size: 16px; } }
.cmd__tasklist { display: grid; gap: 0; margin: 6px 0 0; padding: 0; list-style: none; border: 1px solid $line;
  li { display: flex; align-items: center; gap: 14px; padding: 12px 16px; font-size: 17px; color: #8a8a90; }
  li + li { border-top: 1px solid $line; }
  li.now { background: rgba($sel,.1); color: #fff; box-shadow: inset 4px 0 $sel; }
  li.done { color: #fff; .cmd__tick { background: $ok; color: #04150a; } } }
.cmd__tick { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: #ffffff1a; font-weight: 800; font-size: 14px; }
.cmd__hint { margin: 4px 0 0; font-size: 16px; color: $sel; }
.cmd__mock { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; border: 1px solid $line; background: #050507; min-height: 300px; }
.cmd__closed { padding: 18px 26px; border: 1px dashed $line; color: #8a8a90; font-size: 16px; }
.cmd__summary { display: grid; gap: 0; width: min(580px, 100%); margin: 0; padding: 0; list-style: none; border: 1px solid $line;
  li { display: flex; justify-content: space-between; gap: 20px; padding: 14px 18px; font-size: 16px; } li + li { border-top: 1px solid $line; } b { color: $ok; } b.off { color: #8a8a90; font-weight: 500; } }
.cmd__bullets { display: grid; gap: 0; max-width: 660px; margin: 4px 0 12px; padding: 0; list-style: none; font-size: 17px; text-align: left; border: 1px solid $line;
  li { padding: 14px 18px; } li + li { border-top: 1px solid $line; }
  kbd { padding: 2px 8px; background: #fff; color: #111; font-weight: 800; } }
.cmd__foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 52px; padding-top: 14px; border-top: 1px solid $line; font-size: 14px; color: #c9c9ce; }
.cmd__foot-actions { display: flex; gap: 10px; }
.cmd__primary:disabled { background: #ffffff1f; color: #8a8a90; cursor: default; }
.cmd__note { margin: 0; font-size: 14px; line-height: 1.6; color: #8a8a90; }
.cmd__row--start { justify-content: flex-start; margin-top: 6px; }
// Keyboard practice: a sketch of the screen with the corner where the real panel appears.
.cmd__mock--screen { position: relative; flex-direction: column; gap: 22px; }
.cmd__keys { display: flex; align-items: center; gap: 12px; color: #fff; font-size: 26px; font-weight: 700;
  kbd { min-width: 64px; padding: 12px 18px; background: #fff; color: #111; font: 800 28px/1 'Inter', sans-serif; text-align: center; box-shadow: 0 5px 0 #8a8a92; } }
.cmd__kb-status { margin: 0; font-size: 18px; font-weight: 600; color: $sel; .is-open & { color: $ok; } }
// Never push content above the frame: centre only when it fits.
.cmd__screen { justify-content: safe center; }
// Short windows (laptop 720/768 px): keep the breathing room, just tighter.
@media (max-height: 820px) {
  .cmd { gap: 16px; padding: 18px 32px 12px; }
  .cmd__screen { gap: 14px; }
  .cmd__title { font-size: 28px; }
  .cmd__wizard { gap: 12px; }
  .cmd__wizard-icon { width: 220px; height: 124px; }
  .cmd__wizard-ask { font-size: 32px; }
  .cmd__ok { font-size: 18px; }
  .cmd__choice { padding: 14px 20px 18px; gap: 4px; }
  .cmd__choice :deep(.dev) { width: 160px; height: 90px; }
  .cmd__tasks { gap: 12px; }
  .cmd__tasklist li { padding: 9px 14px; font-size: 16px; }
}
@media (max-width: 860px) {
  .cmd { padding: 20px 18px; }
  .cmd__choices { grid-template-columns: 1fr; }
  .cmd { height: auto; }
  .cmd__screen--practice, .cmd__screen--assign { flex-direction: column; }
  .cmd__assign { flex: none; }
  .cmd__tasks { flex: none; }

  .cmd__wizard-ask { font-size: 28px; }
}
</style>
