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
    <header>DAMAGE</header>
    <div class="damage-race__stage">
      <div class="damage-race__body damage-race__body--front" :class="severity(damage?.body.front.percentage)">
        <b>{{ percent(damage?.body.front.percentage) }}</b><span>{{ time(damage?.body.front.repairTimeMs) }}</span>
      </div>
      <div class="damage-race__body damage-race__body--left" :class="severity(damage?.body.left.percentage)"><b>{{ percent(damage?.body.left.percentage) }}</b><span>{{ time(damage?.body.left.repairTimeMs) }}</span></div>
      <div class="damage-race__body damage-race__body--right" :class="severity(damage?.body.right.percentage)"><b>{{ percent(damage?.body.right.percentage) }}</b><span>{{ time(damage?.body.right.repairTimeMs) }}</span></div>
      <div class="damage-race__body damage-race__body--rear" :class="severity(damage?.body.rear.percentage)">
        <span>{{ time(damage?.body.rear.repairTimeMs) }}</span><b>{{ percent(damage?.body.rear.percentage) }}</b>
      </div>

      <svg class="damage-race__car" viewBox="0 0 220 430" role="img" aria-label="Sagoma GT3 vista dall'alto">
        <path class="shell" d="M61 30 Q110 6 159 30 L178 91 187 145 181 328 160 383 60 383 39 328 33 145 42 91Z" />
        <path class="glass" d="M73 76 Q110 55 147 76 L157 138 63 138Z" />
        <path class="glass" d="M62 157 Q110 141 158 157 L151 280 Q110 298 69 280Z" />
        <path class="line" d="M43 91 Q110 112 177 91M60 327 Q110 308 160 327M57 383H163" />
        <path class="wing" d="M37 17H183V31H37ZM28 384H192V402H28Z" />
        <rect class="wheel" x="18" y="95" width="27" height="82" rx="10"/><rect class="wheel" x="175" y="95" width="27" height="82" rx="10"/>
        <rect class="wheel" x="18" y="286" width="27" height="82" rx="10"/><rect class="wheel" x="175" y="286" width="27" height="82" rx="10"/>
      </svg>

      <div v-for="id in ['FL','FR','RL','RR'] as const" :key="id" class="damage-race__susp" :class="[`damage-race__susp--${id.toLowerCase()}`, severity(damage?.suspension[id].percentage)]">
        <small>{{ id }}</small><b>{{ percent(damage?.suspension[id].percentage) }}</b>
      </div>
      <div class="damage-race__summary damage-race__summary--susp"><small>SUSPENSION</small><strong>{{ time(damage?.suspension.repairTimeMs) }}</strong></div>
      <div class="damage-race__summary damage-race__summary--total"><small>TOTAL</small><strong>{{ time(damage?.totalRepairTimeMs) }}</strong></div>
    </div>
  </section>
</template>

<style scoped>
.damage-race { display:flex; flex:1; flex-direction:column; min-height:0; color:#fff; font-family:Inter,"Segoe UI",sans-serif; font-variant-numeric:tabular-nums; }
.damage-race>header { display:grid; place-items:center; flex:0 0 calc(72px * var(--hud-scale,1)); border-bottom:1px solid #555; font-size:max(28px,calc(38px * var(--hud-scale,1))); font-weight:950; letter-spacing:.06em; }
.damage-race__stage { position:relative; flex:1; min-height:0; overflow:hidden; }
.damage-race__car { position:absolute; top:15%; left:50%; width:55%; height:68%; transform:translateX(-50%); }
.damage-race__car .shell,.damage-race__car .glass,.damage-race__car .line,.damage-race__car .wing,.damage-race__car .wheel { fill:rgba(255,255,255,.025); stroke:#777; stroke-width:3; vector-effect:non-scaling-stroke; }.damage-race__car .glass{fill:rgba(255,255,255,.04)}.damage-race__car .line{fill:none}.damage-race__car .wheel{fill:#080808;stroke:#999}
.damage-race__body { position:absolute; display:flex; align-items:center; justify-content:center; gap:calc(8px * var(--hud-scale,1)); border:2px solid currentColor; border-radius:calc(9px * var(--hud-scale,1)); background:color-mix(in srgb,currentColor 20%,transparent); color:#777; font-weight:950; box-sizing:border-box; }
.damage-race__body b { font-size:max(22px,calc(30px * var(--hud-scale,1))); }.damage-race__body span { font-size:max(16px,calc(21px * var(--hud-scale,1))); }
.damage-race__body--front { top:3%; left:19%; width:62%; height:12%; }.damage-race__body--rear { right:19%; bottom:3%; left:19%; height:12%; }
.damage-race__body--left { top:27%; bottom:27%; left:2%; width:17%; flex-direction:column; gap:2px; }.damage-race__body--right { top:27%; right:2%; bottom:27%; width:17%; flex-direction:column; gap:2px; }
.damage-race__body--left span,.damage-race__body--right span { font-size:max(12px,calc(15px * var(--hud-scale,1))); }
.damage-race__body.healthy,.damage-race__susp.healthy { opacity:.35;color:#777}.damage-race__body.yellow,.damage-race__susp.yellow{color:#fff200}.damage-race__body.orange,.damage-race__susp.orange{color:#ff9d00}.damage-race__body.red,.damage-race__susp.red{color:#ff2b2b}
.damage-race__susp { position:absolute; display:grid; place-items:center; min-width:calc(72px * var(--hud-scale,1)); padding:calc(4px * var(--hud-scale,1)); border:1px solid currentColor; border-radius:5px; color:#777; background:#080808; transform:translate(-50%,-50%); }.damage-race__susp small{font-size:max(12px,calc(15px * var(--hud-scale,1)));font-weight:900}.damage-race__susp b{font-size:max(18px,calc(24px * var(--hud-scale,1)))}
.damage-race__susp--fl{top:27%;left:24%}.damage-race__susp--fr{top:27%;left:76%}.damage-race__susp--rl{top:70%;left:24%}.damage-race__susp--rr{top:70%;left:76%}
.damage-race__summary { position:absolute; left:50%; display:grid; place-items:center; transform:translateX(-50%); text-align:center; }.damage-race__summary small{font-size:max(15px,calc(19px * var(--hud-scale,1)));font-weight:900}.damage-race__summary strong{font-size:max(22px,calc(30px * var(--hud-scale,1)));line-height:1;color:#ff9d00}.damage-race__summary--susp{top:36%}.damage-race__summary--total{top:55%}.damage-race__summary--total strong{color:#ff3b30}
</style>
