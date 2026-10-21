<script setup lang="ts">
// PIP-571: line icons of the two command choices. 'wheel' = GT wheel + button box, 'keyboard' =
// keyboard (Ctrl and K marked) + mouse. They come alive when the parent choice is hovered or
// focused (.cmd__choice:hover): the wheel steers, the box buttons light up, Ctrl+K is pressed.
import { computed } from 'vue'

const props = defineProps<{ kind: 'wheel' | 'keyboard' }>()

// Keyboard: three rows of keys; Ctrl (bottom left) and K (middle row) are the ones that move.
const KEY = 9
const GAP = 2.4
const keys = computed(() => {
  if (props.kind !== 'keyboard') return []
  const out: Array<{ x: number; y: number; w: number; id?: 'ctrl' | 'k' }> = []
  for (let row = 0; row < 3; row++) {
    const offset = row === 1 ? 4 : row === 2 ? 0 : 2
    const count = row === 2 ? 7 : 8
    let x = 14 + offset
    for (let i = 0; i < count; i++) {
      const ctrl = row === 2 && i === 0
      const w = ctrl ? 15 : KEY
      out.push({ x, y: 34 + row * (KEY + GAP), w, id: ctrl ? 'ctrl' : row === 1 && i === 6 ? 'k' : undefined })
      x += w + GAP
    }
  }
  return out
})
</script>

<template>
  <svg class="dev" :class="`dev--${kind}`" viewBox="0 0 160 90" aria-hidden="true">
    <template v-if="kind === 'wheel'">
      <!-- GT wheel: two grips, rev lights, display, buttons and two rotary knobs. -->
      <g class="dev__wheel">
        <path class="dev__paddle" d="M14 30 L6 34 L8 44 L15 42 M86 30 L94 34 L92 44 L85 42" />
        <path class="dev__line dev__rim" d="M25 18 H75 Q86 18 88 30 L91 52 Q92 67 80 71 L68 72 L64 68 H36 L32 72 L20 71 Q8 67 9 52 L12 30 Q14 18 25 18 Z" />
        <path class="dev__line dev__grip" d="M21 28 Q16 46 21 63 M79 28 Q84 46 79 63" />
        <rect class="dev__top" x="47.5" y="15.5" width="5" height="5" />
        <circle v-for="(x, i) in [38, 44, 50, 56, 62]" :key="`rev${i}`" class="dev__rev" :class="`dev__rev--${i < 2 ? 'g' : i < 4 ? 'y' : 'r'}`" :style="{ animationDelay: `${i * 0.12}s` }" :cx="x" cy="23.5" r="1.9" />
        <rect class="dev__screen" x="37" y="28" width="26" height="12" />
        <path class="dev__screen-bar" d="M40 36 H52" />
        <circle class="dev__btn dev__btn--a" cx="31" cy="34" r="2.8" /><circle class="dev__btn dev__btn--b" cx="31" cy="43" r="2.8" />
        <circle class="dev__btn dev__btn--c" cx="69" cy="34" r="2.8" /><circle class="dev__btn dev__btn--d" cx="69" cy="43" r="2.8" />
        <g class="dev__knob" style="transform-origin: 41px 52px"><circle class="dev__line" cx="41" cy="52" r="4.2" /><path class="dev__tick" d="M41 52 V48.4" /></g>
        <g class="dev__knob dev__knob--b" style="transform-origin: 59px 52px"><circle class="dev__line" cx="59" cy="52" r="4.2" /><path class="dev__tick" d="M59 52 V48.4" /></g>
      </g>
      <!-- Button box: three toggle switches, two lit buttons, a rotary. -->
      <g class="dev__box">
        <path class="dev__line" d="M104 22 H148 V68 H112 L104 60 Z" />
        <g v-for="(x, i) in [114, 126, 138]" :key="`sw${i}`">
          <rect class="dev__sw-base" :x="x - 4" y="30" width="8" height="12" />
          <path class="dev__lever" :style="{ transformOrigin: `${x}px 36px`, animationDelay: `${i * 0.2}s` }" :d="`M${x} 36 V29`" />
        </g>
        <circle class="dev__led" cx="118" cy="56" r="4.4" style="animation-delay: .1s" />
        <circle class="dev__led" cx="130" cy="56" r="4.4" style="animation-delay: .45s" />
        <g class="dev__knob dev__knob--b" style="transform-origin: 141px 56px"><circle class="dev__line" cx="141" cy="56" r="4.4" /><path class="dev__tick" d="M141 56 V52.2" /></g>
      </g>
    </template>
    <template v-else>
      <rect class="dev__line" x="8" y="27" width="108" height="44" />
      <rect
        v-for="(k, i) in keys"
        :key="i"
        class="dev__key"
        :class="k.id && `dev__key--${k.id}`"
        :x="k.x" :y="k.y" :width="k.w" :height="KEY"
      />
      <text class="dev__label" x="21.5" y="63" text-anchor="middle">Ctrl</text>
      <text class="dev__label" x="90.9" y="51.8" text-anchor="middle">K</text>
      <g class="dev__mouse">
        <rect class="dev__line" x="126" y="27" width="26" height="44" rx="13" />
        <path class="dev__line" d="M139 27 V44 M126 44 H152" />
        <path class="dev__click" d="M127.2 43 V39 Q127.2 28.2 138 28.2 V43 Z" />
        <rect class="dev__accent" x="137.2" y="32" width="3.6" height="7" />
      </g>
    </template>
  </svg>
</template>

<style scoped lang="scss">
$red: #e3122a;
$ease: cubic-bezier(.45, 0, .55, 1);
.dev { display: block; width: 210px; height: 118px; overflow: visible; }
.dev__line { fill: none; stroke: #c9c9ce; stroke-width: 2; stroke-linejoin: round; transition: stroke .4s ease; }
.dev__accent { fill: none; stroke: $red; stroke-width: 2; }
.dev__btn { fill: #8a8a90; }
.dev__led { fill: #ffffff26; stroke: #c9c9ce; stroke-width: 1.4; }
.dev__key { fill: #ffffff0d; stroke: #8a8a90; stroke-width: 1.1; transform-box: fill-box; }
.dev__key--ctrl, .dev__key--k { stroke: $red; stroke-width: 1.6; }
.dev__label { fill: #fff; font: 800 5.5px/1 'Inter', sans-serif; pointer-events: none; }
.dev__click { fill: transparent; }
.dev__wheel { transform-box: view-box; transform-origin: 50px 45px; }
// Race wheel details: thick rim with grips, top marker, coloured rev lights, display, paddles.
.dev__rim { fill: #ffffff0a; stroke-width: 2.6; }
.dev__grip { stroke-width: 4.5; stroke-linecap: round; stroke: #8a8a90; }
.dev__top { fill: #ffd400; }
.dev__paddle { fill: none; stroke: #8a8a90; stroke-width: 2.4; stroke-linejoin: round; }
.dev__rev { opacity: .7; &--g { fill: #21ff83; } &--y { fill: #ffd400; } &--r { fill: $red; } }
.dev__screen { fill: #050507; stroke: $red; stroke-width: 1.8; }
.dev__screen-bar { stroke: #21ff83; stroke-width: 2.4; }
.dev__btn--a { fill: $red; } .dev__btn--b { fill: #ffd400; } .dev__btn--c { fill: #2f7bff; } .dev__btn--d { fill: #21ff83; }
.dev__btn { opacity: .8; }
.dev__tick { stroke: $red; stroke-width: 1.8; stroke-linecap: round; }
.dev__knob { transform-box: view-box; }
.dev__sw-base { fill: #ffffff14; stroke: #8a8a90; stroke-width: 1.2; }
.dev__lever { stroke: #fff; stroke-width: 2.4; stroke-linecap: round; transform-box: view-box; transform: rotate(-25deg); }
:global(.cmd__choice:hover) .dev__rev, :global(.cmd__choice:focus-visible) .dev__rev { animation: dev-rev .9s steps(1) infinite; }
:global(.cmd__choice:hover) .dev__knob, :global(.cmd__choice:focus-visible) .dev__knob { animation: dev-knob 1.8s $ease infinite; }
:global(.cmd__choice:hover) .dev__knob--b, :global(.cmd__choice:focus-visible) .dev__knob--b { animation-delay: .5s; }
:global(.cmd__choice:hover) .dev__lever, :global(.cmd__choice:focus-visible) .dev__lever { animation: dev-lever 1.8s $ease infinite; }
:global(.cmd__choice:hover) .dev__screen-bar, :global(.cmd__choice:focus-visible) .dev__screen-bar { animation: dev-bar .9s ease-in-out infinite alternate; }
@keyframes dev-rev { 0% { opacity: .25 } 30% { opacity: 1 } 100% { opacity: 1 } }
@keyframes dev-knob { 0%, 100% { transform: rotate(0) } 40% { transform: rotate(90deg) } 70% { transform: rotate(45deg) } }
@keyframes dev-lever { 0%, 100% { transform: rotate(-25deg) } 45%, 70% { transform: rotate(25deg) } }
@keyframes dev-bar { from { stroke-dasharray: 4 20 } to { stroke-dasharray: 20 20 } }

// Alive on hover/focus of the whole choice button.
:global(.cmd__choice:hover) .dev__line, :global(.cmd__choice:focus-visible) .dev__line { stroke: #fff; }
:global(.cmd__choice:hover) .dev__wheel, :global(.cmd__choice:focus-visible) .dev__wheel { animation: dev-steer 1.8s $ease infinite; }
:global(.cmd__choice:hover) .dev__led, :global(.cmd__choice:focus-visible) .dev__led { animation: dev-led 1.1s ease-in-out infinite; }
:global(.cmd__choice:hover) .dev__key--ctrl, :global(.cmd__choice:focus-visible) .dev__key--ctrl { animation: dev-press 1.6s ease-in-out infinite; }
:global(.cmd__choice:hover) .dev__key--k, :global(.cmd__choice:focus-visible) .dev__key--k { animation: dev-press 1.6s ease-in-out .3s infinite; }
:global(.cmd__choice:hover) .dev__click, :global(.cmd__choice:focus-visible) .dev__click { animation: dev-click 1.6s ease-in-out .9s infinite; }
@keyframes dev-steer { 0%, 100% { transform: rotate(0) } 30% { transform: rotate(-16deg) } 70% { transform: rotate(12deg) } }
@keyframes dev-led { 0%, 100% { fill: #ffffff26 } 40% { fill: $red } }
@keyframes dev-press { 0%, 55%, 100% { fill: #ffffff0d; transform: none } 15%, 40% { fill: $red; transform: translateY(1.4px) } }
@keyframes dev-click { 0%, 30%, 100% { fill: transparent } 8%, 20% { fill: $red } }
@media (prefers-reduced-motion: reduce) {
  :global(.cmd__choice:hover) .dev__wheel, :global(.cmd__choice:hover) .dev__led, :global(.cmd__choice:hover) .dev__key--ctrl,
  :global(.cmd__choice:hover) .dev__key--k, :global(.cmd__choice:hover) .dev__click, :global(.cmd__choice:hover) .dev__rev,
  :global(.cmd__choice:hover) .dev__knob, :global(.cmd__choice:hover) .dev__lever, :global(.cmd__choice:hover) .dev__screen-bar { animation: none; }
}
</style>
