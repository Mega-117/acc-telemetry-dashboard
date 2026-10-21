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
      <g class="dev__wheel">
        <path class="dev__line" d="M16 31 Q16 19 28 19 H72 Q84 19 84 31 V52 Q84 62 74 66 L63 72 H37 L26 66 Q16 62 16 52 Z" />
        <rect class="dev__accent" x="38" y="26" width="24" height="10" />
        <rect class="dev__line" x="42" y="47" width="16" height="15" />
        <circle class="dev__btn" cx="28" cy="39" r="3" /><circle class="dev__btn" cx="28" cy="49" r="3" />
        <circle class="dev__btn" cx="72" cy="39" r="3" /><circle class="dev__btn" cx="72" cy="49" r="3" />
      </g>
      <g class="dev__box">
        <rect class="dev__line" x="98" y="25" width="46" height="42" />
        <circle v-for="(c, i) in [[109, 37], [121, 37], [133, 37], [109, 55], [121, 55], [133, 55]]" :key="i" class="dev__led" :style="{ animationDelay: `${i * 0.18}s` }" :cx="c[0]" :cy="c[1]" r="4.2" />
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
  :global(.cmd__choice:hover) .dev__key--k, :global(.cmd__choice:hover) .dev__click { animation: none; }
}
</style>
