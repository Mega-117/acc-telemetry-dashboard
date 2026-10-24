<script setup lang="ts">
// PIP-571 / PIP-612: the introduction window. A step rail always on top (Racer Core,
// Automazioni, Comandi), two short cards, then the command setup, which is the only way
// out: "done" when the pilot finishes it, "later" when they postpone. Either way a last
// screen confirms the end before the window closes. Each step slides in.
import { computed, onMounted, ref, watch } from 'vue'
import OnboardingPanelShowcase from '~/components/onboarding/OnboardingPanelShowcase.vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useOnboardingIntro, type OnboardingPhase, type OnboardingResult } from '~/composables/useOnboardingIntro'
import { usePublicPath } from '~/composables/usePublicPath'
import { ONBOARDING_STEPS } from '~/services/onboarding/onboardingSteps'

const intro = useOnboardingIntro()
const { currentUser } = useFirebaseAuth()
const { getPublicPath } = usePublicPath()

// PIP-612: a short racing title and, instead of a sentence, the one thing to remember:
// the key that opens the menu (the one just chosen, and Ctrl+K). Any simulator.
const FINISH: Record<OnboardingResult, { title: string; accent: string; text: string }> = {
  done: { title: 'Pronto', accent: 'per la pista', text: '' },
  later: { title: 'Pronto', accent: 'per la pista', text: 'I tasti del volante li imposti quando vuoi in Impostazioni → Comandi.' },
}
const menuKey = ref<string | null>(null)

const steps = ONBOARDING_STEPS
const railLabels = [...steps.map(s => s.label), 'Comandi']
const index = ref(0)
const phase = ref<OnboardingPhase | 'finish'>('tour')
const result = ref<OnboardingResult>('done')
const direction = ref<'next' | 'prev'>('next')
const root = ref<HTMLElement | null>(null)
const step = computed(() => steps[index.value]!)
const finish = computed(() => FINISH[result.value])
const current = computed(() => ({ tour: index.value, commands: steps.length, finish: railLabels.length })[phase.value])
// The fill reaches the end of the current step (equal columns), full on the last screen.
const progress = computed(() => `${Math.min(1, (current.value + 1) / railLabels.length) * 100}%`)
const commands = ref<{ postpone: () => void; pause: () => void; resume: () => void } | null>(null)
const confirmLater = ref(false)
// The confirmation owns the keyboard while it is open: the key list stops listening.
watch(confirmLater, (open) => {
  if (open) commands.value?.pause()
  else if (phase.value === 'commands') commands.value?.resume()
})

const wheelAvailable = computed(() => {
  if (typeof window === 'undefined') return false
  const api = (window as Window & { electronAPI?: { localIdentityRole?: string; controlsGetState?: () => Promise<unknown> } }).electronAPI
  return !!api?.controlsGetState && api.localIdentityRole === 'primary'
})

const goTo = (target: number) => {
  const clamped = Math.max(0, Math.min(steps.length, target))
  if (clamped === current.value) return
  direction.value = clamped > current.value ? 'next' : 'prev'
  confirmLater.value = false
  if (clamped >= steps.length) { phase.value = 'commands'; return }
  phase.value = 'tour'
  index.value = clamped
}
const next = () => goTo(current.value + 1)
const previous = () => goTo(current.value - 1)
const toCommands = () => goTo(steps.length)
// The status is saved as soon as the setup ends, so closing the app on the last screen keeps it.
const toFinish = (how: OnboardingResult, key: string | null = null) => {
  intro.save(how)
  result.value = how
  menuKey.value = key
  confirmLater.value = false
  direction.value = 'next'
  phase.value = 'finish'
}
const onEscape = () => {
  if (confirmLater.value) confirmLater.value = false
  else if (phase.value === 'tour') toCommands()
  else if (phase.value === 'finish') intro.close(result.value)
}

watch(intro.visible, (open) => {
  if (!open) return
  phase.value = intro.startPhase.value
  index.value = 0
  direction.value = 'next'
  confirmLater.value = false
  requestAnimationFrame(() => root.value?.focus())
}, { immediate: true })
// The owner can still be loading when the layout mounts: retry once the uid arrives.
watch(() => currentUser.value?.uid, (uid) => { if (uid) void intro.showIfFirstTime() })
onMounted(() => { void intro.showIfFirstTime() })
</script>

<template>
  <Teleport to="body">
    <Transition name="onb-exit">
    <div
      v-if="intro.visible.value"
      ref="root"
      class="onboarding"
      role="dialog"
      aria-modal="true"
      aria-label="Introduzione a Racer Core"
      tabindex="-1"
      data-onboarding-intro
      @keydown.esc.prevent="onEscape"
    >
      <div class="onboarding__modal">
        <header class="onboarding__rail-wrap">
          <div class="onboarding__rail-track">
            <ol class="onboarding__rail" :style="{ '--rail-n': railLabels.length }" aria-label="Passi dell'introduzione">
              <li
                v-for="(label, i) in railLabels"
                :key="label"
                class="onboarding__rail-item"
                :class="{ 'is-done': i < current, 'is-now': i === current }"
              >
                <button type="button" data-rail-step :disabled="phase === 'finish'" :aria-current="i === current ? 'step' : undefined" @click="goTo(i)">
                  <span class="onboarding__rail-n">{{ i < current ? '✓' : i + 1 }}</span>
                  <span class="onboarding__rail-label">{{ label }}</span>
                </button>
              </li>
            </ol>
            <!-- Under the steps: each step owns one equal share, full on the last screen. -->
            <span class="onboarding__progress" aria-hidden="true"><span :style="{ width: progress }" /></span>
          </div>
          <!-- PIP-612: one discreet way out, always in the same corner and floating over the
               last column, so it takes no room: "Salta" on the cards, "Lo faccio dopo" on the
               commands. Its confirmation opens right under it, nothing moves elsewhere. -->
          <span class="onboarding__skip-slot">
            <Transition name="onb-fade" mode="out-in">
              <button v-if="phase === 'tour'" key="skip" type="button" class="onboarding__skip" data-onboarding-skip @click="toCommands">Salta</button>
              <button v-else-if="phase === 'commands' && wheelAvailable" key="later" type="button" class="onboarding__skip" data-cmd-later @click="confirmLater = !confirmLater">Lo faccio dopo</button>
            </Transition>
            <Transition name="onb-fade">
              <span v-if="confirmLater && phase === 'commands'" class="onboarding__confirm" role="dialog" aria-label="Rimandare i tasti?" data-later-confirm>
                <span>Senza tasti il menu in pista si apre solo con Ctrl+K. Li imposti quando vuoi in Impostazioni → Comandi.</span>
                <span class="onboarding__confirm-actions">
                  <button type="button" class="onboarding__link" data-later-cancel @click="confirmLater = false">Li imposto ora</button>
                  <button type="button" class="onboarding__confirm-go" data-cmd-later-confirm @click="commands?.postpone(); confirmLater = false">Sì, dopo</button>
                </span>
              </span>
            </Transition>
          </span>
        </header>

        <Transition :name="`onb-${direction}`" mode="out-in">
          <div v-if="phase === 'tour'" :key="step.id" class="onboarding__stage" data-onboarding-stage>
            <div class="onboarding__media">
              <OnboardingPanelShowcase v-if="step.scene === 'panel'" />
              <video
                v-else
                class="onboarding__video"
                :src="getPublicPath(step.video ?? '')"
                :poster="step.poster ? getPublicPath(step.poster) : undefined"
                autoplay
                muted
                loop
                playsinline
                disablepictureinpicture
              />
            </div>
            <div class="onboarding__body">
              <div class="onboarding__text">
                <h2 class="onboarding__title">{{ step.title }} <em>{{ step.accent }}</em></h2>
                <p class="onboarding__copy">{{ step.text }}</p>
                <ul v-if="step.chips?.length" class="onboarding__chips" data-onboarding-chips>
                  <li v-for="chip in step.chips" :key="chip">{{ chip }}</li>
                </ul>
              </div>
              <nav class="onboarding__nav" aria-label="Navigazione">
                <button type="button" class="onboarding__link" :class="{ 'is-hidden': index === 0 }" :disabled="index === 0" data-onboarding-prev @click="previous">Indietro</button>
                <button type="button" class="onboarding__next" data-onboarding-next @click="next">Avanti</button>
              </nav>
            </div>
          </div>

          <div v-else-if="phase === 'finish'" key="finish" class="onboarding__stage onboarding__finish" data-onboarding-finish>
            <svg class="onboarding__seal" viewBox="0 0 120 120" aria-hidden="true">
              <path class="onboarding__seal-frame" d="M3 3 H117 V97 L97 117 H3 Z" pathLength="1" />
              <path class="onboarding__seal-tick" d="M34 61 L52 79 L87 42" pathLength="1" />
            </svg>
            <h2 class="onboarding__title onboarding__finish-title">{{ finish.title }} <em>{{ finish.accent }}</em></h2>
            <p class="onboarding__copy onboarding__finish-copy onboarding__finish-keys" data-onboarding-keys>
              <span>Menu</span><kbd v-if="menuKey">{{ menuKey }}</kbd><span v-if="menuKey" aria-hidden="true">·</span><kbd>Ctrl+K</kbd>
            </p>
            <p v-if="finish.text" class="onboarding__copy onboarding__finish-copy onboarding__finish-note">{{ finish.text }}</p>
            <button type="button" class="onboarding__next onboarding__finish-go" data-onboarding-start @click="intro.close(result)">Inizia</button>
          </div>

          <OnboardingCommands
            v-else
            key="commands"
            ref="commands"
            class="onboarding__stage"
            :wheel-available="wheelAvailable"
            data-onboarding-commands
            @done="toFinish('done', $event ?? null)"
            @later="toFinish('later')"
          />
        </Transition>
      </div>
    </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
// Racer Core language (square corners, thin light borders) with a single cut corner on actions.
@use '@/assets/scss/racing-settings' as controls;
$red: #e3122a;
$ok: #21ff83;
$line: #ffffff40;
$cut: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
$rail-h: 62px;
$body-h: 156px;
$ease: cubic-bezier(.22, .61, .36, 1);

.onboarding {
  position: fixed;
  inset: 0;
  z-index: 11000; // above the dashboard chrome, below app notifications (12000)
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(4, 4, 8, .88);
  backdrop-filter: blur(6px);
  outline: none;
  animation: onb-fade .6s ease-out;
}
@keyframes onb-fade { from { opacity: 0 } to { opacity: 1 } }
// One fixed frame for every step, so nothing jumps; it shrinks with the window height.
.onboarding__modal {
  --onb-w: min(1120px, calc(100vw - 48px), calc((100vh - 48px - #{$rail-h + $body-h}) * 16 / 9));
  @include controls.tokens;
  width: var(--onb-w);
  height: calc(var(--onb-w) * 9 / 16 + #{$rail-h + $body-h});
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0b0b0b;
  border: 1px solid $line;
  box-shadow: 0 40px 120px rgba(0, 0, 0, .8);
  animation: onb-rise .8s $ease;
}
@keyframes onb-rise { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }

// Step rail
.onboarding__rail-wrap { position: relative; z-index: 3; flex: 0 0 $rail-h; display: flex; align-items: center; padding: 0 32px; border-bottom: 1px solid $line; }
.onboarding__rail-track { position: relative; flex: 1; align-self: stretch; display: flex; align-items: center; min-width: 0; }
// Equal columns, no gaps: each step owns exactly one share of the progress line below.
.onboarding__rail { display: grid; grid-template-columns: repeat(var(--rail-n, 3), minmax(0, 1fr)); width: 100%; margin: 0; padding: 0; list-style: none; }
.onboarding__rail-item { min-width: 0;
  button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 4px; transition: color .4s ease; border: 0; background: none; color: #77777d; font: 600 12px/1 'Inter', 'Segoe UI', sans-serif; text-transform: uppercase; letter-spacing: .02em; cursor: pointer; text-align: left;
    &:hover { color: #fff; }
    &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; } }
  &.is-done button { color: #c9c9ce; }
  &.is-now button { color: #fff; } }
.onboarding__rail-n { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: #ffffff14; color: inherit; font: 700 14px/1 'Racer Display', 'Inter', sans-serif; transform: skewX(-12deg); transition: background .5s ease, color .5s ease;
  .is-done & { background: $ok; color: #04150a; }
  .is-now & { background: $red; color: #fff; animation: onb-pop .7s $ease; } }
@keyframes onb-pop { 0% { transform: skewX(-12deg) scale(.85) } 60% { transform: skewX(-12deg) scale(1.06) } 100% { transform: skewX(-12deg) scale(1) } }
.onboarding__rail-label { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.onboarding__progress { position: absolute; left: 0; right: 0; bottom: -1px; height: 3px; background: transparent;
  span { display: block; height: 100%; background: $red; transition: width .9s $ease; } }
// Floats over the end of the last column: it takes no room, the steps keep equal widths.
.onboarding__skip-slot { position: absolute; top: 0; right: 32px; bottom: 0; display: flex; align-items: center; justify-content: flex-end; }
.onboarding__skip { padding: 8px 0; border: 0; background: none; white-space: nowrap; color: #8a8a90; font: 500 13px/1 'Inter', 'Segoe UI', sans-serif; cursor: pointer; transition: color .3s ease;
  &:hover { color: #fff; text-decoration: underline; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; } }
.onboarding__confirm { position: absolute; top: calc(100% + 8px); right: 0; z-index: 5; display: grid; gap: 12px; width: 320px; padding: 14px 16px; border: 1px solid $line; background: #141417; color: #c9c9ce; font: 400 13px/1.45 'Inter', 'Segoe UI', sans-serif; text-align: left; box-shadow: 0 12px 30px #000a; }
.onboarding__confirm-actions { display: flex; align-items: center; justify-content: flex-end; gap: 18px; }
.onboarding__confirm-go { padding: 9px 16px; border: 0; background: $red; color: #fff; font: 700 13px/1 'Inter', sans-serif; cursor: pointer;
  &:hover { background: #f21a33; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; } }

// Step content
.onboarding__stage { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.onboarding__media { position: relative; flex: 0 0 auto; width: 100%; aspect-ratio: 16 / 9; background: #000; border-bottom: 1px solid $line; overflow: hidden; }
.onboarding__video { display: block; width: 100%; height: 100%; object-fit: cover; background: #000; }
.onboarding__body { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 28px; align-items: center; padding: 0 32px; }
.onboarding__title { margin: 0; font: 700 28px/1.05 'Racer Display', 'Inter', 'Segoe UI', sans-serif; white-space: nowrap; text-transform: uppercase; color: #fff; em { font-style: inherit; color: $red; } }
.onboarding__copy { margin: 12px 0 0; max-width: 680px; color: rgba(255, 255, 255, .82); font: 400 16px/1.4 'Inter', 'Segoe UI', sans-serif; }
// What else is there: small tags with the red underline of the active choices.
.onboarding__chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 0; padding: 0; list-style: none;
  li { padding: 6px 12px; background: #ffffff10; box-shadow: inset 0 -2px $red; color: #e6e6ea; font: 600 13px/1 'Inter', 'Segoe UI', sans-serif; } }
.onboarding__nav { display: flex; align-items: center; gap: 40px; }
.onb-fade-enter-active, .onb-fade-leave-active { transition: opacity .3s ease; }
.onb-fade-enter-from, .onb-fade-leave-to { opacity: 0; }
.onboarding__link.is-hidden { visibility: hidden; }
.onboarding__link { padding: 6px 0; border: 0; background: none; color: #b3b3b8; font: 500 14px/1 'Inter', 'Segoe UI', sans-serif; cursor: pointer;
  &:hover:not(:disabled) { color: #fff; text-decoration: underline; }
  &:disabled { opacity: .3; cursor: default; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; } }
.onboarding__next { padding: 15px 40px 15px 34px; border: 0; background: $red; color: #fff; font: 700 18px/1 'Racer Display', 'Inter', sans-serif; text-transform: uppercase; cursor: pointer; clip-path: $cut; transition: background .3s ease;
  &:hover { background: #f21a33; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: -4px; } }

// Last screen: the cut-corner frame draws itself, then the tick, then the words rise.
.onboarding__finish { align-items: center; justify-content: center; gap: 22px; text-align: center; }
.onboarding__seal { width: 132px; height: 132px; fill: none; stroke-linecap: square;
  path { stroke-dasharray: 1; stroke-dashoffset: 1; }
  .onboarding__seal-frame { stroke: $line; stroke-width: 2; animation: onb-draw 1.1s $ease .2s forwards; }
  .onboarding__seal-tick { stroke: $ok; stroke-width: 9; animation: onb-draw .8s $ease 1.1s forwards; } }
@keyframes onb-draw { to { stroke-dashoffset: 0 } }
.onboarding__finish-title { font-size: 44px; opacity: 0; animation: onb-up .8s $ease 1.6s forwards; }
.onboarding__finish-copy { margin: 0; opacity: 0; animation: onb-up .8s $ease 1.9s forwards; }
// The keys to remember, drawn as keys.
.onboarding__finish-keys { display: flex; align-items: center; justify-content: center; gap: 12px; color: #b3b3b8; font-size: 15px; text-transform: uppercase; letter-spacing: .1em;
  kbd { padding: 8px 14px; border: 1px solid $line; background: #ffffff10; color: #fff; font: 700 17px/1 'Inter', sans-serif; letter-spacing: 0; text-transform: none; box-shadow: inset 0 -2px $red; } }
.onboarding__finish-note { font-size: 14px; color: #8a8a90; }
.onboarding__finish-go { margin-top: 10px; opacity: 0; animation: onb-up .8s $ease 2.2s forwards; }
@keyframes onb-up { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
.onboarding__rail-item button:disabled { cursor: default; &:hover { color: inherit; } }

// Closing: the window settles back and fades while the dark veil lifts onto the dashboard.
.onb-exit-leave-active { transition: opacity .9s ease .15s, backdrop-filter .9s ease .15s;
  .onboarding__modal { transition: transform .8s $ease, opacity .7s ease; } }
.onb-exit-leave-to { opacity: 0; backdrop-filter: blur(0);
  .onboarding__modal { transform: scale(.96) translateY(12px); opacity: 0; } }

// Step change: slide in the direction of travel
// Soft and unhurried: the old step fades away gently, the new one glides in.
.onb-next-enter-active, .onb-prev-enter-active { transition: transform .6s $ease, opacity .6s ease; }
.onb-next-leave-active, .onb-prev-leave-active { transition: transform .45s ease-in-out, opacity .45s ease-in-out; }
.onb-next-enter-from { transform: translateX(28px); opacity: 0; }
.onb-next-leave-to { transform: translateX(-20px); opacity: 0; }
.onb-prev-enter-from { transform: translateX(-28px); opacity: 0; }
.onb-prev-leave-to { transform: translateX(20px); opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .onboarding, .onboarding__modal, .onboarding__rail-n { animation: none !important; }
  .onboarding__seal path { animation: none !important; stroke-dashoffset: 0; }
  .onb-exit-leave-active { transition: opacity .4s ease; .onboarding__modal { transition: none; } }
  .onb-exit-leave-to .onboarding__modal { transform: none; }
  .onboarding__finish-title, .onboarding__finish-copy, .onboarding__finish-go { animation: none !important; opacity: 1; }
  .onb-next-enter-active, .onb-next-leave-active, .onb-prev-enter-active, .onb-prev-leave-active { transition: opacity .3s; }
  .onb-next-enter-from, .onb-next-leave-to, .onb-prev-enter-from, .onb-prev-leave-to { transform: none; }
}
@media (max-width: 760px) {
  .onboarding { padding: 12px; }
  .onboarding__modal { width: calc(100vw - 24px); height: auto; max-height: calc(100vh - 24px); overflow: auto; }
  .onboarding__rail-label { display: none; }
  .onboarding__body { grid-template-columns: 1fr; padding: 18px; }
  .onboarding__nav { justify-content: space-between; }
  .onboarding__title { font-size: 26px; }
}
</style>
