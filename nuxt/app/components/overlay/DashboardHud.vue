<script setup lang="ts">
import type { DashboardPresentation } from '~/utils/dashboardPresentation'

defineProps<{ model: DashboardPresentation }>()
</script>

<template>
  <div
    class="dashboard"
    :class="{
      'dashboard--flash': model.shiftFlash,
      'dashboard--running': model.rpmBand !== 'off',
      'dashboard--fuel-low': model.fuelUrgency !== 'normal',
      'dashboard--fuel-critical-pulse': model.fuelCriticalPulse,
    }"
  >
    <div class="speed" :class="{ 'speed--pit': model.pitLimiterOn, 'speed--faster': model.speedDeltaFaster }">
      <span class="speed__indicator speed__indicator--left" :class="{ 'is-active': model.leftIndicatorActive }" />
      <span class="speed__indicator speed__indicator--right" :class="{ 'is-active': model.rightIndicatorActive }" />
      <strong>{{ model.speed }}</strong>
      <small v-if="model.speedDelta !== null">{{ model.speedDelta }}</small>
    </div>
    <span
      class="round-light"
      :class="[`round-light--stage-${model.lightsStage}`, { 'is-active': model.lightsStage > 0 }]"
    />
    <span
      class="square-light"
      :class="{ 'is-active': model.rainLightsActive }"
    />

    <div class="rpm-bar" :class="`rpm-bar--${model.rpmBand}`">
      <span class="rpm-fill" :style="{ width: `${model.rpmRatio * 100}%` }" />
      <span
        v-if="model.rpmReferenceRatio !== null"
        class="rpm-reference"
        :style="{ left: `${model.rpmReferenceRatio * 100}%` }"
      />
      <span
        v-if="model.shiftThresholdRatio !== null"
        class="shift-reference"
        :style="{ left: (model.shiftThresholdRatio * 100) + '%' }"
      />
      <span v-if="model.shiftFlash" class="rpm-flash" aria-hidden="true" />
      <strong>{{ model.ignitionLabel }}</strong>
    </div>

    <div class="tile tile--cyan fuel-lap"><b>Fuel/Lap</b><strong>{{ model.fuelPerLap }}</strong></div>
    <div class="tile tile--orange fuel"><b>Fuel</b><strong>{{ model.fuel }}</strong></div>
    <div class="tile tile--cyan gear"><b>Gear</b><strong>{{ model.gear }}</strong><small v-if="model.gearReference !== null">{{ model.gearReference }}</small></div>
    <div class="tile tile--orange laps"><b>{{ model.remainingLabel }}</b><strong>{{ model.remainingValue }}</strong></div>
    <div class="tile tile--orange fuel-left"><b>Fuel Left</b><strong>{{ model.fuelLeft }}</strong></div>

    <div class="tile tile--cyan map"><b>MAP</b><strong>{{ model.engineMap }}</strong><small v-if="model.engineMapReference !== null">{{ model.engineMapReference }}</small></div>
    <div class="tile tile--orange tc2"><b>TC2</b><strong>{{ model.tractionControl2 }}</strong><small v-if="model.tractionControl2Reference !== null">{{ model.tractionControl2Reference }}</small></div>
    <div class="tile tile--red tc"><b>TC</b><strong>{{ model.tractionControl }}</strong><small v-if="model.tractionControlReference !== null">{{ model.tractionControlReference }}</small></div>
    <div class="inputs">
      <span class="inputs__gas" :style="{ width: `${model.throttlePct}%` }" />
      <span class="inputs__brake" :style="{ width: `${model.brakePct}%` }" />
    </div>
    <div class="tile tile--blue abs"><b>ABS</b><strong>{{ model.abs }}</strong><small v-if="model.absReference !== null">{{ model.absReference }}</small></div>
    <div class="tile tile--green bb"><b>BB</b><strong>{{ model.brakeBias }}</strong></div>
    <div class="tile tile--darkred cs"><b>CS</b><strong>{{ model.cornerSpeed }}</strong></div>
  </div>
</template>

<style scoped>
.dashboard {
  position: relative;
  width: 665px;
  height: 225px;
  overflow: hidden;
  box-sizing: border-box;
  border: 7px solid #090909;
  border-radius: 12px;
  background: #000;
  color: #f8f8f8;
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 900;
  line-height: 1;
}
.speed { position:absolute; left:9px; top:16px; width:68px; height:34px; overflow:hidden; border-radius:6px; background:#222; display:grid; place-items:center; font-size:24px; }
.speed strong{position:relative;z-index:2}
.speed small{position:absolute;z-index:3;right:3px;bottom:2px;font-size:10px;color:#fff}.speed--faster{background:#d000d0}
.speed__indicator{position:absolute;inset:0 50% 0 0;background:#ffae00;opacity:0}
.speed__indicator--right{inset:0 0 0 50%}
.speed__indicator.is-active{opacity:.72}
.speed--pit{box-shadow:inset 0 0 0 3px #00c8d4}
.round-light { position:absolute; left:84px; top:20px; width:27px; height:27px; box-sizing:border-box; border:3px solid #555; border-radius:50%;opacity:.4 }
.round-light::after { content:""; position:absolute; inset:6px; border-radius:50%; background:currentColor; }
.round-light.is-active{opacity:1}.round-light--stage-1{border-color:#9acd32;color:#9acd32}.round-light--stage-2{border-color:#168cff;color:#168cff}
.square-light { position:absolute; left:118px; top:23px; width:21px; height:21px; background:#555;opacity:.4 }
.square-light.is-active{background:#ffae00;opacity:1}
.rpm-bar { position:absolute; left:146px; top:16px; width:497px; height:34px; overflow:hidden; border-radius:6px; background:#000; }
.rpm-bar strong { position:absolute; z-index:3; inset:0; display:grid; place-items:center; font-size:36px; white-space:nowrap; }
.rpm-fill { position:absolute; z-index:0; inset:0 auto 0 0; background:#008000; }
.rpm-bar--off{background:#4a2900}.rpm-bar--off .rpm-fill{display:none}
.rpm-bar--green .rpm-fill{background:#008000}.rpm-bar--blue .rpm-fill{background:#001a8d}
.rpm-bar--pit{background:#0000ff}.rpm-bar--pit .rpm-fill{display:none}
.rpm-reference { position:absolute; z-index:1; top:0; bottom:0; width:2px; background:#fff; opacity:.85; }
.shift-reference { position:absolute; z-index:1; top:0; bottom:0; width:2px; border-left:2px dashed #fff; opacity:.55; }
.rpm-flash { position:absolute; z-index:2; inset:0; background:#001a8d; pointer-events:none; animation:shift-flash 260ms steps(1,end) infinite; }
.tile { position:absolute; box-sizing:border-box; border:3px solid; background:#000; text-align:center; }
.tile b { display:block; margin-top:3px; font-size:24px; line-height:25px; white-space:nowrap; }
.tile strong { display:block; font-size:32px; line-height:34px; white-space:nowrap; }
.tile small{position:absolute;right:3px;top:3px;padding:1px 2px;background:#fff;color:#000;font-size:10px;line-height:11px}
.tile--cyan{border-color:#00c8d4}.tile--orange{border-color:#ffae00;color:#ffae00}.tile--red{border-color:#ff101b;background:#fa101b;color:#fff}.tile--blue{border-color:#1900ff}.tile--green{border-color:#009a28}.tile--darkred{border-color:#9f1820}
.dashboard--running .fuel,.dashboard--running .laps,.dashboard--running .fuel-left{border-color:#00c8d4;background:#000;color:#fff}
.dashboard--running.dashboard--fuel-low .fuel,
.dashboard--running.dashboard--fuel-low .laps,
.dashboard--running.dashboard--fuel-low .fuel-left{border-color:#ffae00;color:#ffae00}
.dashboard--fuel-critical-pulse .fuel,
.dashboard--fuel-critical-pulse .laps,
.dashboard--fuel-critical-pulse .fuel-left{animation:fuel-critical-pulse 520ms steps(1,end) infinite}
.dashboard--running .tc{border-color:#9acd32;background:#000;color:#fff}
.fuel-lap{left:10px;top:58px;width:121px;height:68px}.fuel{left:138px;top:58px;width:121px;height:68px}
.gear{left:266px;top:58px;width:120px;height:120px}.gear strong{font-size:80px;line-height:82px}
.laps{left:394px;top:58px;width:120px;height:68px}.fuel-left{left:522px;top:58px;width:121px;height:68px}
.map{left:10px;top:133px;width:78px;height:69px}.tc2{left:95px;top:133px;width:77px;height:69px}.tc{left:180px;top:133px;width:79px;height:69px}
.abs{left:394px;top:133px;width:77px;height:69px}.bb{left:478px;top:133px;width:78px;height:69px}.cs{left:563px;top:133px;width:80px;height:69px}
.map b,.tc2 b,.tc b,.abs b,.bb b,.cs b{font-size:23px}.map strong,.tc2 strong,.tc strong,.abs strong,.bb strong,.cs strong{font-size:31px}
.inputs { position:absolute; left:266px; top:184px; width:120px; height:18px; overflow:hidden; border-radius:6px; background:#111; }
.inputs__gas,.inputs__brake{position:absolute;left:0;height:50%}.inputs__gas{top:0;background:#16a34a}.inputs__brake{bottom:0;background:#dc2626}
@keyframes shift-flash { 0%,49%{background:#001a8d}50%,100%{background:#46c7ff} }
@keyframes fuel-critical-pulse {
  0%,49%{border-color:#ffae00;box-shadow:inset 0 0 0 1px #ffae00}
  50%,100%{border-color:#5f4100;box-shadow:none}
}
</style>
