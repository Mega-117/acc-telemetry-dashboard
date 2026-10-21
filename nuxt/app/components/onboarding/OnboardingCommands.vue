<script setup lang="ts">
// PIP-571: the last step of the introduction, all about the "pannello rapido" (Ctrl+K).
// Wheel: choose, assign five buttons one at a time, practise on a faithful copy of the panel
// (test mode: the game receives nothing). Keyboard: press the real Ctrl+K twice; the copy
// mirrors the real panel opening. "Lo faccio dopo" postpones and the next launch asks again.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import OnboardingDeviceIcon from '~/components/onboarding/OnboardingDeviceIcon.vue'
import OnboardingPanelReplica from '~/components/onboarding/OnboardingPanelReplica.vue'
import { useKeyboardCapture } from '~/composables/useKeyboardCapture'
import { useWheelInputBridge } from '~/composables/useWheelInputBridge'
import { canBeginAutoCapture, commandErrorText } from '~/services/controls/commandCapture'
import { formatWheelBinding, type WheelControlAction } from '~/services/controls/wheelBindingModel'
import {
  applyKeyboardClick,
  applyKeyboardVisibility,
  applyPracticePress,
  initialKeyboardPractice,
  initialPractice,
  keyboardPracticeDone,
  PRACTICE_TASKS,
  PRACTICE_TILES,
  practiceDone,
  practiceHint,
} from '~/services/onboarding/commandPractice'

const props = defineProps<{ wheelAvailable: boolean }>()
const emit = defineEmits<{ done: []; later: [] }>()

type Screen = 'choose' | 'assign' | 'practice' | 'ready' | 'keyboard'
const REQUIRED: Array<{ id: WheelControlAction; title: string; detail: string }> = [
  { id: 'togglePalette', title: 'Apri e chiudi il pannello rapido', detail: 'Il pulsante che userai di più.' },
  { id: 'nextAction', title: 'Voce successiva', detail: 'Passa alla voce dopo.' },
  { id: 'previousAction', title: 'Voce precedente', detail: 'Torna alla voce prima.' },
  { id: 'activateAction', title: 'Conferma', detail: 'Attiva la voce scelta.' },
  { id: 'mainMenu', title: 'Indietro', detail: 'Esce dalla voce, poi chiude il pannello.' },
]
const STEP_SAVED_MS = 900
const PRACTICE_DONE_MS = 900

const bridge = useWheelInputBridge()
const { state, testedActions } = bridge
const { keyHint, reset: resetKeyCapture } = useKeyboardCapture(bridge)

const screen = ref<Screen>(props.wheelAvailable ? 'choose' : 'keyboard')
const confirmLater = ref(false)
const assignIndex = ref(0)
const autoArmed = ref(false)
const saved = ref(false)
const error = ref('')
const practice = ref(initialPractice())
const timers = new Set<ReturnType<typeof setTimeout>>()
const later = (fn: () => void, ms: number) => { const t = setTimeout(() => { timers.delete(t); fn() }, ms); timers.add(t) }

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
const stepNumber = computed(() => ({ choose: 1, keyboard: 2, assign: 2, practice: 3, ready: 3 } as const)[screen.value])
const steps = computed(() => screen.value === 'keyboard' ? ['Scegli', 'Prova'] : ['Scegli', 'Assegna', 'Prova'])

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
  screen.value = 'keyboard'
  keyboardPractice.value = initialKeyboardPractice()
  if (!stopVisibility && keyboardPracticeSupported.value) {
    stopVisibility = visibilityApi()!.onTrainingOverlayVisibility!((payload) => {
      if (screen.value === 'keyboard') keyboardPractice.value = applyKeyboardVisibility(keyboardPractice.value, payload?.visible === true)
    })
  }
}

function chooseWheel() { screen.value = 'assign'; enterAction(0) }
function enterAction(index: number) {
  assignIndex.value = index
  error.value = ''
  saved.value = false
  resetKeyCapture()
  autoArmed.value = !state.value.bindings[REQUIRED[index]!.id]
  armCapture()
}
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
function change() { error.value = ''; autoArmed.value = true; armCapture() }
function keep() { goNextAction() }
function goNextAction() {
  if (assignIndex.value < REQUIRED.length - 1) enterAction(assignIndex.value + 1)
  else startPractice()
}
function previousAction() {
  if (state.value.capture) void bridge.cancelCapture()
  if (assignIndex.value > 0) enterAction(assignIndex.value - 1)
  else screen.value = 'choose'
}

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
  } else {
    error.value = commandErrorText(state.value.operation?.reason || state.value.lastError) || 'Nessun pulsante ricevuto. Premi Riprova.'
  }
})

function startPractice() {
  screen.value = 'practice'
  practice.value = initialPractice()
  bridge.setTestMode(true)
}
function restartAssign() { bridge.setTestMode(false); screen.value = 'assign'; enterAction(0) }
watch(() => [...testedActions.value], (now, before) => {
  if (screen.value !== 'practice') return
  for (const action of now) {
    if (before?.includes(action)) continue
    practice.value = applyPracticePress(practice.value, action)
  }
  if (practiceDone(practice.value)) {
    bridge.setTestMode(false)
    later(() => { screen.value = 'ready' }, PRACTICE_DONE_MS)
  }
})
const practiceTask = computed(() => PRACTICE_TASKS[practice.value.task])
const hint = computed(() => practiceHint(practice.value))

function askLater() { confirmLater.value = true }
function postpone() { confirmLater.value = false; void release(); emit('later') }
function finish() { void release(); emit('done') }
async function release() {
  for (const t of timers) clearTimeout(t)
  timers.clear()
  stopVisibility?.(); stopVisibility = null
  await bridge.finishConfiguration()
}

onMounted(() => { if (props.wheelAvailable) void bridge.start() })
onBeforeUnmount(() => { void release() })
</script>

<template>
  <section class="cmd" aria-label="Comandi del pannello">
    <header class="cmd__head">
      <ol class="cmd__steps" aria-label="Passi dei comandi">
        <li v-for="(label, i) in steps" :key="label" :class="{ on: stepNumber === i + 1 || (screen === 'keyboard' && i === 1), done: screen !== 'keyboard' ? stepNumber > i + 1 : i === 0 }">{{ i + 1 }} {{ label }}</li>
      </ol>
    </header>

    <Transition name="cmd-swap" mode="out-in">
    <!-- 1. Scegli -->
    <div v-if="screen === 'choose'" class="cmd__screen" data-cmd-screen="choose">
      <h2 class="cmd__title">Il pannello rapido <em>dal volante</em></h2>
      <p class="cmd__lead">In guida le mani restano sul volante. Usa i suoi pulsanti.</p>
      <div class="cmd__choices">
        <button type="button" class="cmd__choice cmd__choice--main" data-cmd-wheel @click="chooseWheel">
          <OnboardingDeviceIcon kind="wheel" />
          <strong>Volante o button box</strong>
          <span>Assegniamo 5 pulsanti. Due minuti.</span>
        </button>
        <button type="button" class="cmd__choice" data-cmd-keyboard @click="chooseKeyboard">
          <OnboardingDeviceIcon kind="keyboard" />
          <strong>Solo tastiera e mouse</strong>
          <span>Proviamo Ctrl+K insieme.</span>
        </button>
      </div>
      <p class="cmd__devices" role="status">
        <template v-if="readerStatus">{{ readerStatus }}</template>
        <template v-else-if="controllers.length">Collegati: {{ controllers.join(', ') }}</template>
        <template v-else>Nessun volante collegato. Collegalo: lo trovo da solo.</template>
      </p>
    </div>

    <!-- 2. Assegna, un comando alla volta -->
    <div v-else-if="screen === 'assign'" class="cmd__screen cmd__screen--assign" data-cmd-screen="assign">
      <div class="cmd__assign-head">
        <h2 class="cmd__title">Assegna i pulsanti <em>del volante</em></h2>
        <p class="cmd__lead">Cinque comandi, uno alla volta.</p>
      </div>
      <ol class="cmd__slots" aria-label="Comandi da assegnare">
        <li
          v-for="(item, i) in REQUIRED"
          :key="item.id"
          class="cmd__slot"
          :class="{ now: i === assignIndex, set: !!state.bindings[item.id] && i !== assignIndex || i === assignIndex && saved }"
          :data-slot="item.id"
        >
          <span class="cmd__slot-n">{{ i + 1 }}</span>
          <span class="cmd__slot-name">{{ item.title }}</span>
          <span class="cmd__slot-value">{{ state.bindings[item.id] ? formatWheelBinding(state.bindings[item.id]) : 'da assegnare' }}</span>
        </li>
      </ol>

      <Transition name="cmd-next" mode="out-in">
      <div :key="current.id" class="cmd__target" :class="{ 'is-waiting': waiting, 'is-saved': saved, 'is-error': !!error }" data-cmd-target>
        <p class="cmd__target-label">Comando {{ assignIndex + 1 }} di {{ REQUIRED.length }}</p>
        <p class="cmd__target-name">{{ current.title }}</p>
        <p class="cmd__target-detail">{{ current.detail }}</p>
        <template v-if="saved">
          <span class="cmd__ok"><span class="cmd__check" aria-hidden="true">✓</span> Assegnato a {{ formatWheelBinding(currentBinding) }}</span>
        </template>
        <template v-else-if="waiting">
          <span class="cmd__ask"><span class="cmd__pulse" aria-hidden="true" /> Premi il pulsante sul volante</span>
          <small>{{ keyHint || 'Scegline uno comodo. Esc per annullare.' }}</small>
        </template>
        <template v-else-if="error">
          <span role="alert">{{ error }}</span>
          <button type="button" class="cmd__primary" data-cmd-retry @click="retry">Riprova</button>
        </template>
        <template v-else-if="currentBinding">
          <span>Già assegnato: <b>{{ formatWheelBinding(currentBinding) }}</b></span>
          <div class="cmd__row">
            <button type="button" class="cmd__primary" data-cmd-keep @click="keep">Va bene così</button>
            <button type="button" class="cmd__ghost" data-cmd-change @click="change">Cambia</button>
          </div>
        </template>
        <template v-else>
          <span>{{ readerStatus || 'Un attimo…' }}</span>
        </template>
      </div>
      </Transition>
    </div>

    <!-- 3. Prova il pannello -->
    <div v-else-if="screen === 'practice'" class="cmd__screen cmd__screen--practice" data-cmd-screen="practice">
      <div class="cmd__tasks">
        <h2 class="cmd__title">Prova il <em>pannello rapido</em></h2>
        <p class="cmd__lead">Usa i tuoi pulsanti. Il gioco non riceve niente.</p>
        <ol class="cmd__tasklist">
          <li v-for="(task, i) in PRACTICE_TASKS" :key="task.id" :class="{ done: i < practice.task, now: i === practice.task }" :data-task="task.id">
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
        <div v-else class="cmd__closed">Pannello rapido chiuso</div>
      </div>
    </div>

    <!-- Fatto -->
    <div v-else-if="screen === 'ready'" class="cmd__screen" data-cmd-screen="ready">
      <h2 class="cmd__title"><span class="cmd__check" aria-hidden="true">✓</span> Comandi <em>pronti</em></h2>
      <ul class="cmd__summary">
        <li v-for="item in REQUIRED" :key="item.id"><span>{{ item.title }}</span><b>{{ formatWheelBinding(state.bindings[item.id]) }}</b></li>
      </ul>
      <p class="cmd__lead">Li cambi quando vuoi in Impostazioni → Comandi.</p>
      <button type="button" class="cmd__primary cmd__primary--big" data-cmd-finish @click="finish">Avanti</button>
    </div>

    <!-- Solo tastiera e mouse -->
    <div v-else class="cmd__screen cmd__screen--practice" data-cmd-screen="keyboard">
      <div class="cmd__tasks">
        <h2 class="cmd__title">Prova il <em>pannello rapido</em></h2>
        <p class="cmd__lead">Tieni premuto Ctrl e premi K. Si apre davvero, in alto a destra dello schermo.</p>
        <ol v-if="keyboardPracticeSupported" class="cmd__tasklist">
          <li :class="{ done: keyboardPractice.opened, now: !keyboardPractice.opened }" data-task="kb-open">
            <span class="cmd__tick" aria-hidden="true">{{ keyboardPractice.opened ? '✓' : 1 }}</span>
            Apri il pannello con Ctrl+K
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
        <p class="cmd__note">Per usarlo in guida, assegna i pulsanti in Impostazioni → Comandi.</p>
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

    <footer v-if="wheelAvailable && screen !== 'ready'" class="cmd__foot">
      <template v-if="confirmLater">
        <span>Senza pulsanti non usi il pannello rapido in guida. Te lo richiedo al prossimo avvio.</span>
        <span class="cmd__foot-actions">
          <button type="button" class="cmd__ghost" @click="confirmLater = false">Li assegno ora</button>
          <button type="button" class="cmd__ghost" data-cmd-later-confirm @click="postpone">Sì, dopo</button>
        </span>
      </template>
      <template v-else>
        <button v-if="screen === 'assign'" type="button" class="cmd__back" data-cmd-back @click="previousAction">Indietro</button>
        <button v-else-if="screen === 'keyboard'" type="button" class="cmd__back" data-cmd-back @click="screen = 'choose'">Indietro</button>
        <button v-else-if="screen === 'practice'" type="button" class="cmd__back" data-cmd-reassign @click="restartAssign">Non funziona? Riassegna</button>
        <span v-else />
        <button type="button" class="cmd__later" data-cmd-later @click="askLater">Lo faccio dopo</button>
      </template>
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
.cmd__screen--assign { display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); grid-template-rows: auto 1fr; grid-template-areas: 'head head' 'slots target'; align-content: center; align-items: stretch; text-align: left; gap: 24px 32px; }
.cmd__assign-head { grid-area: head; }
.cmd__slots { grid-area: slots; display: grid; grid-auto-rows: 1fr; gap: 0; margin: 0; padding: 0; list-style: none; border: 1px solid $line; }
.cmd__slot { display: grid; grid-template-columns: 32px 1fr; grid-template-rows: auto auto; align-content: center; column-gap: 14px; row-gap: 4px; padding: 14px 18px; color: #8a8a90;
  & + & { border-top: 1px solid $line; }
  &.now { background: rgba($sel,.1); color: #fff; box-shadow: inset 4px 0 $sel; }
  &.set { color: #fff; .cmd__slot-n { background: $ok; color: #04150a; } .cmd__slot-value { color: $ok; } } }
.cmd__slot-n { grid-row: 1 / 3; align-self: center; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: #ffffff1a; font-weight: 800; }
.cmd__slot-name { font-size: 16px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cmd__slot-value { font-size: 13px; color: #8a8a90; }
.cmd__target { grid-area: target; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 14px; padding: 32px; border: 1px solid $line; background: #ffffff08; font-size: 18px; font-weight: 600;
  small { font-size: 14px; font-weight: 400; color: #b3b3b8; }
  &.is-waiting { border: 2px solid $sel; }
  &.is-saved { border: 2px solid $ok; }
  &.is-error { border: 2px solid $red; } }
.cmd__target-label { margin: 0; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: #b3b3b8; }
.cmd__target-name { margin: 0; font: 700 38px/1.05 'Racer Display', 'Inter', sans-serif; text-transform: uppercase; color: #fff; }
.cmd__target-detail { margin: 0 0 10px; font-size: 16px; font-weight: 400; color: #c9c9ce; }
.cmd__ask, .cmd__ok { display: inline-flex; align-items: center; gap: 14px; font-size: 20px; }
.cmd__ask { color: $sel; }
.cmd__ok { color: $ok; }
.cmd__pulse { width: 22px; height: 22px; background: $sel; animation: cmd-pulse 1.6s ease-in-out infinite; }
@keyframes cmd-pulse { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
.cmd__check { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: $ok; color: #04150a; font-size: 24px; font-weight: 900; vertical-align: middle; }
.cmd__row { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
.cmd__target .cmd__row { justify-content: flex-start; }
.cmd__primary { padding: 14px 36px 14px 28px; border: 0; border-radius: 0; background: $red; color: #fff; font: 700 15px/1 'Inter', sans-serif; text-transform: uppercase; letter-spacing: .04em; cursor: pointer; clip-path: $chamfer;
  &:hover { background: #f21a33; } &:focus-visible { outline: 2px solid #fff; outline-offset: -4px; } }
.cmd__primary--big { padding: 16px 48px 16px 36px; font: 700 20px/1 'Racer Display', 'Inter', sans-serif; }
.cmd__ghost { padding: 14px 28px 14px 22px; border: 0; background: #ffffff16; color: #fff; font: 600 14px/1 'Inter', sans-serif; cursor: pointer; clip-path: $chamfer;
  &:hover { background: #ffffff26; } &:focus-visible { outline: 2px solid #fff; outline-offset: -4px; } }
.cmd__slot { transition: background .6s ease, color .6s ease, box-shadow .6s ease; }
.cmd__slot-n, .cmd__tick { transition: background .6s ease, color .6s ease; }
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
.cmd__screen--practice { flex-direction: row; align-items: stretch; justify-content: flex-start; text-align: left; gap: 40px; }
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
  li { display: flex; justify-content: space-between; gap: 20px; padding: 14px 18px; font-size: 16px; } li + li { border-top: 1px solid $line; } b { color: $ok; } }
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
.cmd__screen--assign { align-content: safe center; }
// Short windows (laptop 720/768 px): keep the breathing room, just tighter.
@media (max-height: 820px) {
  .cmd { gap: 16px; padding: 18px 32px 12px; }
  .cmd__screen { gap: 14px; }
  .cmd__title { font-size: 28px; }
  .cmd__screen--assign { gap: 14px 24px; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); }
  .cmd__slot { padding: 6px 14px; row-gap: 2px; }
  .cmd__slot-name { font-size: 15px; }
  .cmd__slot-n { width: 28px; height: 28px; }
  .cmd__target { padding: 20px 24px; gap: 10px; }
  .cmd__target-name { font-size: 28px; }
  .cmd__ask, .cmd__ok { font-size: 18px; }
  .cmd__choice { padding: 14px 20px 18px; gap: 4px; }
  .cmd__choice :deep(.dev) { width: 160px; height: 90px; }
  .cmd__tasks { gap: 12px; }
  .cmd__tasklist li { padding: 9px 14px; font-size: 16px; }
}
@media (max-width: 860px) {
  .cmd { padding: 20px 18px; }
  .cmd__choices { grid-template-columns: 1fr; }
  .cmd { height: auto; }
  .cmd__screen--assign { grid-template-columns: 1fr; grid-template-rows: auto; grid-template-areas: 'head' 'target' 'slots'; }
  .cmd__screen--practice { flex-direction: column; }
  .cmd__tasks { flex: none; }

  .cmd__target-name { font-size: 28px; }
}
</style>
