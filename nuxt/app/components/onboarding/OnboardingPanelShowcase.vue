<script setup lang="ts">
// PIP-571: the "Pannello rapido" card. Instead of a clip where the panel is a small corner, the
// copy of the real panel sits large in the middle: Ctrl+K is pressed, the panel opens, "Avvisi"
// opens the four voice alerts (they speak by default; here is where you turn them off). Then it
// is the pilot's turn: the copy answers the mouse like the real one. Nothing talks to the game.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import OnboardingPanelReplica from '~/components/onboarding/OnboardingPanelReplica.vue'
import { PRACTICE_TILES, VOICE_ALERTS, VOICE_TILE } from '~/services/onboarding/commandPractice'

type Scene = 'keys' | 'pressed' | 'open'
const VOICE_STATUS = 'Di base parlano. Li spegni da qui.'
// Slow on purpose: each beat is readable before the next one starts.
const TIMELINE: Array<[number, () => void]> = [
  [1100, () => { scene.value = 'pressed' }],
  [1700, () => { scene.value = 'open' }],
  [2900, () => { selected.value = VOICE_TILE }],
  [4000, () => openVoice()],
]

const scene = ref<Scene>('keys')
const selected = ref<number | null>(null)
const confirmed = ref<number | null>(null)
const voiceOpen = ref(false)
const voice = ref(VOICE_ALERTS.map(() => true))
const status = ref('')
const timers: Array<ReturnType<typeof setTimeout>> = []

function stopDemo() { timers.splice(0).forEach(clearTimeout); scene.value = 'open' }
function openVoice() { confirmed.value = null; voiceOpen.value = true; status.value = VOICE_STATUS }
function onSelect(index: number) { stopDemo(); selected.value = index }
function onConfirm(index: number) {
  stopDemo()
  selected.value = index
  if (index === VOICE_TILE) { openVoice(); return }
  confirmed.value = index
  status.value = `Hai scelto: ${PRACTICE_TILES[index]} (prova)`
}
function onBack() { stopDemo(); voiceOpen.value = false; selected.value = VOICE_TILE; status.value = '' }
function onToggleVoice(index: number) {
  stopDemo()
  voice.value = voice.value.map((on, i) => (i === index ? !on : on))
  status.value = `${VOICE_ALERTS[index]}: ${voice.value[index] ? 'acceso' : 'spento'} (prova)`
}

onMounted(() => { for (const [ms, step] of TIMELINE) timers.push(setTimeout(step, ms)) })
onBeforeUnmount(() => timers.splice(0).forEach(clearTimeout))
</script>

<template>
  <div class="showcase" :class="`is-${scene}`" data-onboarding-showcase>
    <div class="showcase__keys" aria-hidden="true"><kbd>Ctrl</kbd><span>+</span><kbd>K</kbd></div>
    <Transition name="showcase-open">
      <div v-if="scene === 'open'" class="showcase__panel">
        <OnboardingPanelReplica
          :selected="selected"
          :confirmed="confirmed"
          :voice-open="voiceOpen"
          :voice="voice"
          :status="status || undefined"
          @select="onSelect"
          @confirm="onConfirm"
          @back="onBack"
          @toggle-voice="onToggleVoice"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
$ease: cubic-bezier(.22, .61, .36, 1);
.showcase { container-type: size; position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; overflow: hidden;
  background: radial-gradient(ellipse at 50% 60%, #e3122a1f, transparent 62%), #050507; }
.showcase__keys { display: flex; align-items: center; gap: 14px; color: #fff; font: 700 30px/1 'Inter', sans-serif; transition: transform .8s $ease, opacity .8s ease;
  kbd { min-width: 78px; padding: 16px 22px; background: #fff; color: #111; font: 800 34px/1 'Inter', sans-serif; text-align: center; box-shadow: 0 7px 0 #8a8a92; transition: transform .25s ease, box-shadow .25s ease; } }
.is-pressed .showcase__keys kbd { transform: translateY(6px); box-shadow: 0 1px 0 #8a8a92; }
.is-open .showcase__keys { transform: scale(.62); opacity: .75; }
.showcase__panel { display: flex; justify-content: center; width: 100%; zoom: 1.35;
  @container (min-width: 760px) { zoom: 1.6; }
  @container (min-width: 960px) and (min-height: 540px) { zoom: 1.85; } }
.showcase-open-enter-active { transition: opacity .7s ease, transform .7s $ease; }
.showcase-open-enter-from { opacity: 0; transform: translateY(18px) scale(.96); }
@media (prefers-reduced-motion: reduce) {
  .showcase__keys, .showcase__keys kbd { transition: none; }
  .showcase-open-enter-active { transition: opacity .3s; }
  .showcase-open-enter-from { transform: none; }
}
</style>
