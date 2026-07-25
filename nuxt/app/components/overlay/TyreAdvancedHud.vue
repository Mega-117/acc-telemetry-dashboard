<script setup lang="ts">
import { computed } from 'vue'
import type { FastOverlayState, FastStateTyre } from '~/composables/useFastStatePoller'
import { tyreSlipBarStyle, tyreSlipStateLabel } from '~/utils/tyreSlipPresentation'

const props = defineProps<{ fastState: FastOverlayState }>()

const wheelIds = ['FL', 'FR', 'RL', 'RR'] as const

const emptyTyre = (id: FastStateTyre['id']): FastStateTyre => ({
  id,
  wheelSlip: null,
  wheelSlipScaled: null,
  slipBand: 'white',
  slipState: 'ok',
  slipRatio: null,
  pressurePsi: null,
  coreTempC: null,
  brakeTempC: null,
  padLifePct: null,
  discLifePct: null,
})

const tyresById = computed(() => Object.fromEntries(
  wheelIds.map(id => [id, props.fastState.tyres.find(tyre => tyre.id === id) ?? emptyTyre(id)]),
) as Record<FastStateTyre['id'], FastStateTyre>)

const targetPressure = computed(() => props.fastState.tyreCompound === 'WET' ? '30.5' : '27.0')
const setLabel = computed(() => {
  const compound = props.fastState.tyreCompound ?? '--'
  const set = props.fastState.tyreSetAvailable && props.fastState.currentTyreSet !== null
    ? props.fastState.currentTyreSet
    : '--'
  return `${compound} ${set}`
})
const globalStatus = computed(() => {
  if (!props.fastState.isLive) return 'NO DATA'
  if (!props.fastState.isEngineRunning) return 'ENGINE OFF'
  if (props.fastState.pitLimiterOn) return 'PIT LIMITER'
  return null
})

function format(value: number | null, digits = 0) {
  return value === null ? '--' : value.toFixed(digits)
}

function averageFor(id: FastStateTyre['id']) {
  const avg = props.fastState.lapPressureAverage
  if (
    avg.status !== 'available'
    || avg.tyreSet === null
    || avg.tyreSet !== props.fastState.currentTyreSet
  ) return '--'
  const value = avg.values[id]
  return value === null ? '--' : value.toFixed(1)
}

function axlePadLife(left: FastStateTyre['id'], right: FastStateTyre['id']) {
  const values = [tyresById.value[left].padLifePct, tyresById.value[right].padLifePct]
    .filter((value): value is number => value !== null)
  return values.length ? `${Math.min(...values).toFixed(0)}%` : '--'
}

function weatherIcon(value: number | null) {
  if (value === null) return '·'
  if (value <= 0) return '☀'
  if (value <= 2) return '☁'
  return '☂'
}

function verticalSlipFill(tyre: FastStateTyre) {
  return tyreSlipBarStyle(tyre.wheelSlipScaled, 'vertical')
}
</script>

<template>
  <section class="tyre-advanced" aria-label="Stato avanzato gomme e freni">
    <div class="tyre-advanced__weather">
      <div v-for="item in [
        { label: '0′', value: fastState.rainIntensity },
        { label: '10′', value: fastState.rainIntensity10Min },
        { label: '30′', value: fastState.rainIntensity30Min },
      ]" :key="item.label">
        <strong>{{ item.label }}</strong>
        <span>{{ weatherIcon(item.value) }}</span>
      </div>
    </div>

    <div class="tyre-advanced__panel">
      <div class="tyre-advanced__target">{{ targetPressure }}</div>

      <div v-for="axle in [
        { key: 'front', left: 'FL' as const, right: 'FR' as const },
        { key: 'rear', left: 'RL' as const, right: 'RR' as const },
      ]" :key="axle.key" class="tyre-advanced__axle">
        <div class="tyre-advanced__corner">
          <strong>{{ format(tyresById[axle.left].pressurePsi, 1) }}</strong>
          <small>AVG {{ averageFor(axle.left) }}</small>
          <div class="tyre-advanced__tyre-line tyre-advanced__tyre-line--left">
            <div
              class="tyre-advanced__slip-bar"
              :class="`tyre-slip--${tyresById[axle.left].slipBand}`"
              aria-hidden="true"
            >
              <span :style="verticalSlipFill(tyresById[axle.left])" />
            </div>
            <div class="tyre-advanced__tyre" :class="`is-${tyresById[axle.left].slipState}`">
              <i v-for="segment in 3" :key="segment" />
              <b>{{ format(tyresById[axle.left].coreTempC) }}°</b>
            </div>
          </div>
          <em>{{ tyreSlipStateLabel(tyresById[axle.left].slipState, fastState.isLive && tyresById[axle.left].wheelSlipScaled !== null) }}</em>
        </div>

        <div class="tyre-advanced__brakes">
          <div class="tyre-advanced__brake-row">
            <span>{{ format(tyresById[axle.left].brakeTempC) }}°</span>
            <i />
            <i />
            <span>{{ format(tyresById[axle.right].brakeTempC) }}°</span>
          </div>
          <strong>{{ axlePadLife(axle.left, axle.right) }}</strong>
          <small>PASTIGLIE</small>
        </div>

        <div class="tyre-advanced__corner">
          <strong>{{ format(tyresById[axle.right].pressurePsi, 1) }}</strong>
          <small>AVG {{ averageFor(axle.right) }}</small>
          <div class="tyre-advanced__tyre-line tyre-advanced__tyre-line--right">
            <div class="tyre-advanced__tyre" :class="`is-${tyresById[axle.right].slipState}`">
              <i v-for="segment in 3" :key="segment" />
              <b>{{ format(tyresById[axle.right].coreTempC) }}°</b>
            </div>
            <div
              class="tyre-advanced__slip-bar"
              :class="`tyre-slip--${tyresById[axle.right].slipBand}`"
              aria-hidden="true"
            >
              <span :style="verticalSlipFill(tyresById[axle.right])" />
            </div>
          </div>
          <em>{{ tyreSlipStateLabel(tyresById[axle.right].slipState, fastState.isLive && tyresById[axle.right].wheelSlipScaled !== null) }}</em>
        </div>
      </div>

      <div class="tyre-advanced__set">{{ setLabel }}</div>
      <div v-if="globalStatus" class="tyre-advanced__status">{{ globalStatus }}</div>
    </div>
  </section>
</template>

<style scoped>
.tyre-advanced {
  /* La finestra Electron viene gia' ridotta con la scala utente. Questi token
     mantengono una soglia leggibile senza impedire ai valori di crescere. */
  --tyre-hud-type-weather: max(10px, calc(14px * var(--hud-scale, 1)));
  --tyre-hud-type-weather-icon: max(11px, calc(15px * var(--hud-scale, 1)));
  --tyre-hud-type-label: max(9.5px, calc(9px * var(--hud-scale, 1)));
  --tyre-hud-type-secondary: max(10px, calc(12px * var(--hud-scale, 1)));
  --tyre-hud-type-target: max(13px, calc(16px * var(--hud-scale, 1)));
  --tyre-hud-type-primary: max(16px, calc(22px * var(--hud-scale, 1)));
  --tyre-hud-type-tyre: max(15px, calc(18px * var(--hud-scale, 1)));
  --tyre-hud-type-pad: max(14px, calc(19px * var(--hud-scale, 1)));
  --tyre-hud-type-set: max(14px, calc(17px * var(--hud-scale, 1)));
  --tyre-hud-type-status: max(14px, calc(19px * var(--hud-scale, 1)));
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  container-type: inline-size;
  gap: calc(6px * var(--hud-scale, 1));
  min-height: 0;
  color: #fff;
  font-family: Inter, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums;
}

.tyre-advanced__weather {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  width: 44%;
  overflow: hidden;
  border-radius: calc(13px * var(--hud-scale, 1));
  background: #8d8d8d;
}

.tyre-advanced__weather div {
  display: grid;
  place-items: center;
  min-width: 0;
}

.tyre-advanced__weather strong {
  padding-top: calc(3px * var(--hud-scale, 1));
  font-size: var(--tyre-hud-type-weather);
}

.tyre-advanced__weather span {
  width: 100%;
  padding: calc(2px * var(--hud-scale, 1)) 0;
  background: #5d5d5d;
  color: #fff;
  font-size: var(--tyre-hud-type-weather-icon);
  text-align: center;
}

.tyre-advanced__panel {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: space-around;
  width: 100%;
  min-height: 0;
  padding: calc(20px * var(--hud-scale, 1)) calc(22px * var(--hud-scale, 1))
    calc(10px * var(--hud-scale, 1));
  border-radius: calc(22px * var(--hud-scale, 1));
  background: #4b4b4b;
  box-sizing: border-box;
}

.tyre-advanced__target {
  position: absolute;
  top: calc(5px * var(--hud-scale, 1));
  left: 50%;
  color: #fff;
  font-size: var(--tyre-hud-type-target);
  font-weight: 900;
  transform: translateX(-50%);
}

.tyre-advanced__axle {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(calc(120px * var(--hud-scale, 1)), .75fr) minmax(0, 1fr);
  align-items: center;
  gap: calc(10px * var(--hud-scale, 1));
}

.tyre-advanced__corner {
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;
  min-width: 0;
}

.tyre-advanced__corner > strong {
  font-size: var(--tyre-hud-type-primary);
  line-height: 1;
}

.tyre-advanced__corner > small {
  margin: calc(2px * var(--hud-scale, 1)) 0;
  color: #fff;
  font-size: var(--tyre-hud-type-label);
  font-weight: 800;
}

.tyre-advanced__corner > em {
  margin-top: calc(2px * var(--hud-scale, 1));
  color: #fff;
  font-size: var(--tyre-hud-type-label);
  font-style: normal;
  font-weight: 900;
}

.tyre-advanced__tyre-line {
  display: grid;
  align-items: stretch;
  gap: calc(4px * var(--hud-scale, 1));
  width: 90%;
}

.tyre-advanced__tyre-line--left {
  grid-template-columns: calc(7px * var(--hud-scale, 1)) minmax(0, 1fr);
}

.tyre-advanced__tyre-line--right {
  grid-template-columns: minmax(0, 1fr) calc(7px * var(--hud-scale, 1));
}

.tyre-advanced__slip-bar {
  position: relative;
  height: calc(48px * var(--hud-scale, 1));
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, .11);
}

.tyre-advanced__slip-bar span {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: block;
  border-radius: inherit;
  background: var(--tyre-slip-color, rgba(226, 238, 247, .72));
  transition:
    height 90ms linear,
    background-color 120ms ease;
}

.tyre-advanced__tyre {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: calc(3px * var(--hud-scale, 1));
  width: 100%;
  height: calc(48px * var(--hud-scale, 1));
  padding: calc(3px * var(--hud-scale, 1));
  border-radius: calc(12px * var(--hud-scale, 1));
  background: #777;
  box-sizing: border-box;
}

.tyre-advanced__tyre i {
  border-radius: calc(4px * var(--hud-scale, 1));
  background: #13c7b7;
}

.tyre-advanced__tyre b {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: var(--tyre-hud-type-tyre);
  text-shadow: 0 1px 3px #000;
}

.tyre-advanced__tyre.is-limit i { background: #facc15; }
.tyre-advanced__tyre.is-sliding i { background: #fb923c; }
.tyre-advanced__tyre.is-wheelspin i { background: #f97316; }
.tyre-advanced__tyre.is-lockup i { background: #ef4444; }

.tyre-advanced__brakes {
  display: grid;
  justify-items: center;
  gap: calc(2px * var(--hud-scale, 1));
}

.tyre-advanced__brake-row {
  display: grid;
  grid-template-columns: auto 1fr 1fr auto;
  align-items: center;
  gap: calc(4px * var(--hud-scale, 1));
  width: 100%;
}

.tyre-advanced__brake-row span {
  font-size: var(--tyre-hud-type-secondary);
  font-weight: 900;
}

.tyre-advanced__brake-row i {
  height: calc(31px * var(--hud-scale, 1));
  border-radius: calc(5px * var(--hud-scale, 1));
  background: #142bd0;
}

.tyre-advanced__brakes > strong {
  font-size: var(--tyre-hud-type-pad);
  line-height: 1;
}

.tyre-advanced__brakes > small {
  color: #fff;
  font-size: var(--tyre-hud-type-label);
  font-weight: 800;
}

.tyre-advanced__set {
  position: absolute;
  top: 50%;
  left: 50%;
  padding: calc(2px * var(--hud-scale, 1)) calc(6px * var(--hud-scale, 1));
  color: #fff;
  font-size: var(--tyre-hud-type-set);
  font-weight: 900;
  transform: translate(-50%, -50%);
  white-space: nowrap;
}

.tyre-advanced__status {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  max-width: 48%;
  padding: calc(5px * var(--hud-scale, 1)) calc(9px * var(--hud-scale, 1));
  border-radius: calc(5px * var(--hud-scale, 1));
  background: rgba(120, 0, 0, .88);
  color: #fff;
  font-size: var(--tyre-hud-type-status);
  font-weight: 950;
  line-height: .95;
  text-align: center;
  transform: translate(-50%, -50%);
}

/* A 60% la V2 vive in una finestra 252x360. Qui la composizione si ricompatta
   attorno ai testi leggibili, invece di ridurre una seconda volta ogni elemento. */
@container (max-width: 300px) {
  .tyre-advanced__weather {
    width: 58%;
  }

  .tyre-advanced__panel {
    padding: 18px 8px 7px;
    border-radius: 14px;
  }

  .tyre-advanced__axle {
    grid-template-columns: minmax(0, 1fr) minmax(66px, .82fr) minmax(0, 1fr);
    gap: 4px;
  }

  .tyre-advanced__corner > strong {
    line-height: .95;
  }

  .tyre-advanced__corner > small,
  .tyre-advanced__corner > em {
    letter-spacing: -.025em;
    white-space: nowrap;
  }

  .tyre-advanced__tyre-line {
    gap: 3px;
    width: 100%;
  }

  .tyre-advanced__tyre-line--left {
    grid-template-columns: 5px minmax(0, 1fr);
  }

  .tyre-advanced__tyre-line--right {
    grid-template-columns: minmax(0, 1fr) 5px;
  }

  .tyre-advanced__slip-bar,
  .tyre-advanced__tyre {
    height: 34px;
  }

  .tyre-advanced__tyre {
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
  }

  .tyre-advanced__brake-row {
    gap: 2px;
  }

  .tyre-advanced__brake-row i {
    height: 24px;
  }
}
</style>
