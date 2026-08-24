<script setup lang="ts">
import { computed } from 'vue'
import type { FastOverlayState } from '~/composables/useFastStatePoller'

const props = defineProps<{ fastState: FastOverlayState }>()
const damage = computed(() => props.fastState.damage)
function percent(value: number | null | undefined) { return value == null ? '--' : `${value.toFixed(0)}%` }
function time(value: number | null | undefined) {
  if (value == null) return '--:--.--'
  const seconds = value / 1000
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`
}
function severity(value: number | null | undefined) {
  if (!value) return 'healthy'
  if (value < 34) return 'yellow'
  if (value < 67) return 'orange'
  return 'red'
}
</script>

<template>
  <section class="damage-race" aria-label="Danni vettura">
    <div class="damage-race__stage">
      <svg class="damage-race__car" viewBox="0 0 220 430" role="img" aria-label="Sagoma GT3 vista dall'alto">
        <path class="damage-race__zone damage-race__zone--front" :class="severity(damage?.body.front.percentage)" d="M59 41Q110 15 161 41L173 104Q110 126 47 104Z" />
        <path class="damage-race__zone damage-race__zone--left" :class="severity(damage?.body.left.percentage)" d="M47 108L65 128L59 310L44 350L32 321L29 154Z" />
        <path class="damage-race__zone damage-race__zone--right" :class="severity(damage?.body.right.percentage)" d="M173 108L155 128L161 310L176 350L188 321L191 154Z" />
        <path class="damage-race__zone damage-race__zone--rear" :class="severity(damage?.body.rear.percentage)" d="M45 354L66 322Q110 338 154 322L175 354L161 390Q110 408 59 390Z" />
        <path class="damage-race__cockpit" d="M70 128Q110 108 150 128L157 301Q110 322 63 301Z" />
        <path class="damage-race__glass" d="M78 142Q110 128 142 142L148 191H72ZM69 231H151L146 286Q110 301 74 286Z" />
        <path class="damage-race__line" d="M47 104Q110 126 173 104M59 390Q110 408 161 390" />
        <path class="damage-race__wing" d="M39 25H181V39H39ZM30 389H190V408H30Z" />
        <rect class="damage-race__wheel" x="16" y="96" width="29" height="86" rx="8" />
        <rect class="damage-race__wheel" x="175" y="96" width="29" height="86" rx="8" />
        <rect class="damage-race__wheel" x="16" y="274" width="29" height="86" rx="8" />
        <rect class="damage-race__wheel" x="175" y="274" width="29" height="86" rx="8" />
      </svg>

      <div class="damage-race__body damage-race__body--front" :class="severity(damage?.body.front.percentage)">
        <b>{{ percent(damage?.body.front.percentage) }}</b><span>{{ time(damage?.body.front.repairTimeMs) }}</span>
      </div>
      <div class="damage-race__body damage-race__body--left" :class="severity(damage?.body.left.percentage)">
        <b>{{ percent(damage?.body.left.percentage) }}</b><span>{{ time(damage?.body.left.repairTimeMs) }}</span>
      </div>
      <div class="damage-race__body damage-race__body--right" :class="severity(damage?.body.right.percentage)">
        <b>{{ percent(damage?.body.right.percentage) }}</b><span>{{ time(damage?.body.right.repairTimeMs) }}</span>
      </div>
      <div class="damage-race__body damage-race__body--rear" :class="severity(damage?.body.rear.percentage)">
        <span>{{ time(damage?.body.rear.repairTimeMs) }}</span><b>{{ percent(damage?.body.rear.percentage) }}</b>
      </div>

      <div
        v-for="id in ['FL','FR','RL','RR'] as const"
        :key="id"
        class="damage-race__susp"
        :class="[`damage-race__susp--${id.toLowerCase()}`, severity(damage?.suspension[id].percentage)]"
      >
        <small>{{ id }}</small><b>{{ percent(damage?.suspension[id].percentage) }}</b>
      </div>

      <div class="damage-race__summary damage-race__summary--susp">
        <small>SUSPENSION</small><strong>{{ time(damage?.suspension.repairTimeMs) }}</strong>
      </div>
      <div class="damage-race__summary damage-race__summary--total">
        <small>TOTAL</small><strong>{{ time(damage?.totalRepairTimeMs) }}</strong>
      </div>
    </div>
  </section>
</template>

<style scoped>
.damage-race { display:flex; flex:1; min-width:0; min-height:0; color:#f7f8fa; font-family:"Bahnschrift Condensed","Arial Narrow","Segoe UI",sans-serif; font-variant-numeric:tabular-nums; font-stretch:condensed; }
.damage-race__stage { position:relative; flex:1; min-width:0; min-height:0; overflow:hidden; background:radial-gradient(circle at 50% 48%,rgba(255,255,255,.035),transparent 50%); }
.damage-race__car { position:absolute; top:8%; left:50%; width:58%; height:84%; transform:translateX(-50%); overflow:visible; }
.damage-race__zone { stroke:currentColor; stroke-width:3; vector-effect:non-scaling-stroke; fill:color-mix(in srgb,currentColor 25%,#050608); }
.damage-race__zone.healthy{color:#64676e;opacity:.35}.damage-race__zone.yellow{color:#fff200}.damage-race__zone.orange{color:#ff9d00}.damage-race__zone.red{color:#ff2b2b}
.damage-race__cockpit,.damage-race__glass,.damage-race__line,.damage-race__wing,.damage-race__wheel { fill:#07090c; stroke:#777b84; stroke-width:3; vector-effect:non-scaling-stroke; }
.damage-race__glass{fill:#11141a}.damage-race__line{fill:none}.damage-race__wheel{fill:#030405;stroke:#a2a5ad}
.damage-race__body { position:absolute; z-index:2; display:flex; align-items:center; justify-content:center; gap:calc(7px * var(--hud-scale,1)); color:#6e7178; font-weight:900; white-space:nowrap; text-shadow:0 2px 3px #000; }
.damage-race__body b { font-size:max(24px,calc(32px * var(--hud-scale,1))); line-height:1; }
.damage-race__body span { font-size:max(17px,calc(22px * var(--hud-scale,1))); line-height:1; }
.damage-race__body--front{top:2%;left:50%;transform:translateX(-50%)}.damage-race__body--rear{bottom:2%;left:50%;transform:translateX(-50%)}
.damage-race__body--left{top:49%;left:2%;flex-direction:column;transform:translateY(-50%)}.damage-race__body--right{top:49%;right:2%;flex-direction:column;transform:translateY(-50%)}
.damage-race__body.healthy,.damage-race__susp.healthy{opacity:.38;color:#777b84}.damage-race__body.yellow,.damage-race__susp.yellow{color:#fff200}.damage-race__body.orange,.damage-race__susp.orange{color:#ff9d00}.damage-race__body.red,.damage-race__susp.red{color:#ff2b2b}
.damage-race__susp { position:absolute; z-index:3; display:flex; align-items:baseline; justify-content:center; gap:calc(4px * var(--hud-scale,1)); min-width:calc(72px * var(--hud-scale,1)); padding:calc(3px * var(--hud-scale,1)) calc(5px * var(--hud-scale,1)); border:1px solid currentColor; border-radius:4px; color:#777b84; background:rgba(3,4,5,.88); transform:translate(-50%,-50%); box-sizing:border-box; }
.damage-race__susp small{font-size:max(13px,calc(16px * var(--hud-scale,1)));font-weight:900}.damage-race__susp b{font-size:max(19px,calc(25px * var(--hud-scale,1)));line-height:1}
.damage-race__susp--fl{top:26%;left:24%}.damage-race__susp--fr{top:26%;left:76%}.damage-race__susp--rl{top:72%;left:24%}.damage-race__susp--rr{top:72%;left:76%}
.damage-race__summary { position:absolute; z-index:4; left:50%; display:grid; place-items:center; min-width:40%; padding:calc(5px * var(--hud-scale,1)); transform:translateX(-50%); border-radius:6px; background:rgba(3,4,5,.78); text-align:center; box-sizing:border-box; }
.damage-race__summary small{font-size:max(17px,calc(21px * var(--hud-scale,1)));font-weight:900;line-height:1}.damage-race__summary strong{font-size:max(25px,calc(33px * var(--hud-scale,1)));font-weight:900;line-height:1.05;color:#ff9d00}
.damage-race__summary--susp{top:34%}.damage-race__summary--total{top:55%}.damage-race__summary--total strong{color:#ff3b30}
@media (max-width:280px) {
  .damage-race__car{top:9%;width:62%;height:82%}.damage-race__body{gap:3px}.damage-race__body b{font-size:24px}.damage-race__body span{font-size:17px}
  .damage-race__susp{min-width:53px;padding:2px}.damage-race__susp small{font-size:13px}.damage-race__susp b{font-size:19px}.damage-race__susp--fl,.damage-race__susp--rl{left:22%}.damage-race__susp--fr,.damage-race__susp--rr{left:78%}
  .damage-race__summary{min-width:44%;padding:3px}.damage-race__summary small{font-size:17px}.damage-race__summary strong{font-size:25px}
}
</style>
