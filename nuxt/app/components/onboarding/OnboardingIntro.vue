<script setup lang="ts">
// PIP-571: the introduction window. A step rail always on top (Racer Core, Ctrl+K, Automazioni,
// HUD, Comandi), four short video cards, then the command setup, which is the only way out:
// "done" when the pilot finishes it, "later" when they postpone. Each step slides in, so the
// change of step is visible.
import { computed, onMounted, ref, watch } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useOnboardingIntro, type OnboardingPhase } from '~/composables/useOnboardingIntro'
import { usePublicPath } from '~/composables/usePublicPath'
import { ONBOARDING_STEPS } from '~/services/onboarding/onboardingSteps'

const intro = useOnboardingIntro()
const { currentUser } = useFirebaseAuth()
const { getPublicPath } = usePublicPath()

const steps = ONBOARDING_STEPS
const railLabels = [...steps.map(s => s.label), 'Comandi']
const index = ref(0)
const phase = ref<OnboardingPhase>('tour')
const direction = ref<'next' | 'prev'>('next')
const root = ref<HTMLElement | null>(null)
const step = computed(() => steps[index.value]!)
const current = computed(() => phase.value === 'tour' ? index.value : steps.length)
const progress = computed(() => `${(current.value / (railLabels.length - 1)) * 100}%`)

const wheelAvailable = computed(() => {
  if (typeof window === 'undefined') return false
  const api = (window as Window & { electronAPI?: { localIdentityRole?: string; controlsGetState?: () => Promise<unknown> } }).electronAPI
  return !!api?.controlsGetState && api.localIdentityRole === 'primary'
})

const goTo = (target: number) => {
  const clamped = Math.max(0, Math.min(steps.length, target))
  if (clamped === current.value) return
  direction.value = clamped > current.value ? 'next' : 'prev'
  if (clamped >= steps.length) { phase.value = 'commands'; return }
  phase.value = 'tour'
  index.value = clamped
}
const next = () => goTo(current.value + 1)
const previous = () => goTo(current.value - 1)
const toCommands = () => goTo(steps.length)
const onEscape = () => { if (phase.value === 'tour') toCommands() }

watch(intro.visible, (open) => {
  if (!open) return
  phase.value = intro.startPhase.value
  index.value = 0
  direction.value = 'next'
  requestAnimationFrame(() => root.value?.focus())
}, { immediate: true })
// The owner can still be loading when the layout mounts: retry once the uid arrives.
watch(() => currentUser.value?.uid, (uid) => { if (uid) void intro.showIfFirstTime() })
onMounted(() => { void intro.showIfFirstTime() })
</script>

<template>
  <Teleport to="body">
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
          <ol class="onboarding__rail" aria-label="Passi dell'introduzione">
            <li
              v-for="(label, i) in railLabels"
              :key="label"
              class="onboarding__rail-item"
              :class="{ 'is-done': i < current, 'is-now': i === current }"
            >
              <button type="button" data-rail-step :aria-current="i === current ? 'step' : undefined" @click="goTo(i)">
                <span class="onboarding__rail-n">{{ i < current ? '✓' : i + 1 }}</span>
                <span class="onboarding__rail-label">{{ label }}</span>
              </button>
            </li>
          </ol>
          <Transition name="onb-fade">
            <button v-if="phase === 'tour'" type="button" class="onboarding__skip" data-onboarding-skip @click="toCommands">Salta</button>
          </Transition>
          <span class="onboarding__progress" aria-hidden="true"><span :style="{ width: progress }" /></span>
        </header>

        <Transition :name="`onb-${direction}`" mode="out-in">
          <div v-if="phase === 'tour'" :key="step.id" class="onboarding__stage" data-onboarding-stage>
            <div class="onboarding__media">
              <video
                class="onboarding__video"
                :src="getPublicPath(step.video)"
                :poster="getPublicPath(step.poster)"
                autoplay
                muted
                loop
                playsinline
                disablepictureinpicture
              />
            </div>
            <div class="onboarding__body">
              <span class="onboarding__num" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
              <div class="onboarding__text">
                <h2 class="onboarding__title">{{ step.title }} <em>{{ step.accent }}</em></h2>
                <p class="onboarding__copy">{{ step.text }}</p>
              </div>
              <nav class="onboarding__nav" aria-label="Navigazione">
                <button type="button" class="onboarding__link" :class="{ 'is-hidden': index === 0 }" :disabled="index === 0" data-onboarding-prev @click="previous">Indietro</button>
                <button type="button" class="onboarding__next" data-onboarding-next @click="next">Avanti</button>
              </nav>
            </div>
          </div>

          <OnboardingCommands
            v-else
            key="commands"
            class="onboarding__stage"
            :wheel-available="wheelAvailable"
            data-onboarding-commands
            @done="intro.close('done')"
            @later="intro.close('later')"
          />
        </Transition>
      </div>
    </div>
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
.onboarding__rail-wrap { position: relative; flex: 0 0 $rail-h; display: flex; align-items: center; padding: 0 32px; border-bottom: 1px solid $line; }
.onboarding__rail { display: flex; flex: 1; justify-content: space-between; gap: 8px; margin: 0; padding: 0; list-style: none; }
.onboarding__rail-item { flex: 0 1 auto; min-width: 0;
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

// Step content
.onboarding__stage { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.onboarding__media { position: relative; flex: 0 0 auto; width: 100%; aspect-ratio: 16 / 9; background: #000; border-bottom: 1px solid $line; overflow: hidden; }
.onboarding__video { display: block; width: 100%; height: 100%; object-fit: cover; background: #000; }
.onboarding__body { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 28px; align-items: center; padding: 0 32px; }
.onboarding__num { font: 700 56px/1 'Racer Display', 'Inter', sans-serif; color: transparent; -webkit-text-stroke: 1.5px $red; letter-spacing: -.02em; }
.onboarding__title { margin: 0; font: 700 28px/1.05 'Racer Display', 'Inter', 'Segoe UI', sans-serif; white-space: nowrap; text-transform: uppercase; color: #fff; em { font-style: inherit; color: $red; } }
.onboarding__copy { margin: 12px 0 0; max-width: 680px; color: rgba(255, 255, 255, .82); font: 400 16px/1.4 'Inter', 'Segoe UI', sans-serif; }
.onboarding__nav { display: flex; align-items: center; gap: 40px; }
.onboarding__skip { flex: 0 0 auto; margin-left: 24px; padding: 8px 0 8px 24px; border: 0; border-left: 1px solid $line; background: none; color: #8a8a90; font: 500 13px/1 'Inter', 'Segoe UI', sans-serif; cursor: pointer; transition: color .3s ease;
  &:hover { color: #fff; text-decoration: underline; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; } }
.onb-fade-enter-active, .onb-fade-leave-active { transition: opacity .5s ease; }
.onb-fade-enter-from, .onb-fade-leave-to { opacity: 0; }
.onboarding__link.is-hidden { visibility: hidden; }
.onboarding__link { padding: 6px 0; border: 0; background: none; color: #b3b3b8; font: 500 14px/1 'Inter', 'Segoe UI', sans-serif; cursor: pointer;
  &:hover:not(:disabled) { color: #fff; text-decoration: underline; }
  &:disabled { opacity: .3; cursor: default; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; } }
.onboarding__next { padding: 15px 40px 15px 34px; border: 0; background: $red; color: #fff; font: 700 18px/1 'Racer Display', 'Inter', sans-serif; text-transform: uppercase; cursor: pointer; clip-path: $cut; transition: background .3s ease;
  &:hover { background: #f21a33; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: -4px; } }

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
  .onb-next-enter-active, .onb-next-leave-active, .onb-prev-enter-active, .onb-prev-leave-active { transition: opacity .3s; }
  .onb-next-enter-from, .onb-next-leave-to, .onb-prev-enter-from, .onb-prev-leave-to { transform: none; }
}
@media (max-width: 760px) {
  .onboarding { padding: 12px; }
  .onboarding__modal { width: calc(100vw - 24px); height: auto; max-height: calc(100vh - 24px); overflow: auto; }
  .onboarding__rail-label { display: none; }
  .onboarding__body { grid-template-columns: 1fr; padding: 18px; }
  .onboarding__num { display: none; }
  .onboarding__nav { justify-content: space-between; }
  .onboarding__title { font-size: 26px; }
}
</style>
