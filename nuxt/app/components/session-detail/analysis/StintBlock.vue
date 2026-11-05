<template>
  <section class="stint-block panel" :aria-label="t('telemetry.stintBlock.stint', { n: facts.stint })">
    <div class="stint-block__tiles">
      <div class="stint-block__tile">
        <span class="stint-block__label">{{ t('telemetry.stintBlock.whichStint') }}</span>
        <strong class="stint-block__big">{{ t('telemetry.stintBlock.stint', { n: facts.stint }) }}</strong>
        <span class="stint-block__sub">{{ kindText }}</span>
      </div>
      <div class="stint-block__tile">
        <span class="stint-block__label">{{ t('telemetry.stintBlock.fuel') }}</span>
        <strong class="stint-block__mid">{{ fuelText }}</strong>
        <span v-if="fuelBars.length" class="stint-block__bars" aria-hidden="true">
          <span v-for="(on, i) in fuelBars" :key="i" :class="{ 'is-on': on }" />
        </span>
        <span class="stint-block__sub">{{ t('telemetry.stintBlock.fuelHint') }}</span>
      </div>
    </div>
    <div class="stint-block__how" :class="howClass" data-testid="stint-block-how">
      <span class="stint-block__label">{{ t('telemetry.stintBlock.howTitle') }}</span>
      <template v-if="lines.length">
        <div v-for="line in lines" :key="line.which" class="stint-block__line">
          <span class="stint-block__line-name">{{ t(`telemetry.stintBlock.line.${line.which}`) }}</span>
          <strong :class="line.cls">{{ line.text }}</strong>
          <span class="stint-block__sub">{{ line.ref }}</span>
        </div>
        <span class="stint-block__hint">{{ t('telemetry.stintBlock.howHint') }}</span>
      </template>
      <span v-else class="stint-block__sub">{{ t('telemetry.stintBlock.noRef') }}</span>
    </div>
    <div v-if="facts.theoreticalMs !== null" class="stint-block__potential">
      <span class="stint-block__potential-text">
        <span class="stint-block__label stint-block__label--purple">{{ t('telemetry.stintBlock.potential') }}</span>
        <span class="stint-block__sub">{{ t('telemetry.stintBlock.potentialHint') }}</span>
      </span>
      <strong>{{ formatLapTime(facts.theoreticalMs) }}</strong>
    </div>
  </section>
</template>

<script setup lang="ts">
// dev.11 (user 05/11, proposal G2): at a glance and for a beginner - which stint it was, the fuel from
// start to finish, how you did against your own saved best (the Sessione page's RIFERIMENTO, its
// numbers handed over, never recomputed here) and your potential (the theoretical lap).
import { computed } from 'vue'
import { stintVerdict, type StintFacts, type StintSummary } from '~/services/telemetry/stintBlock'
import { formatLapTime } from '~/utils/telemetryFormat'
import { useI18n } from '~/i18n'

const props = defineProps<{ facts: StintFacts, summary?: StintSummary | null }>()
const { t, locale } = useI18n()
const dec = (n: number, digits: number) => n.toFixed(digits).replace('.', locale.value === 'it' ? ',' : '.')

const kind = computed(() => props.summary?.kind ?? props.facts.kind)
const kindText = computed(() => [kind.value ? t(`telemetry.stintBlock.kind.${kind.value}`) : '', t('telemetry.stintBlock.laps', { n: props.facts.laps })].filter(Boolean).join(' · '))
const fuelText = computed(() => {
  const { startFuelL: start, endFuelL: end } = props.facts
  if (start === null) return '–'
  return end !== null ? `${Math.round(start)} → ${Math.round(end)} L` : `${Math.round(start)} L`
})
// Six segments, lit for the fuel left at the finish (a gauge anyone reads).
const fuelBars = computed(() => {
  const { startFuelL: start, endFuelL: end } = props.facts
  if (start === null || end === null || start <= 0) return []
  const lit = Math.max(0, Math.min(6, Math.round(6 * end / start)))
  return Array.from({ length: 6 }, (_, i) => i < lit)
})
const lines = computed(() => stintVerdict(props.summary).map((line) => {
  const s = dec(Math.abs(line.diffMs) / 1000, 3)
  const text = line.diffMs < 0 ? t('telemetry.stintBlock.faster', { s }) : line.diffMs > 0 ? t('telemetry.stintBlock.slower', { s }) : t('telemetry.stintBlock.same')
  return { which: line.which, text, cls: line.diffMs < 0 ? 'is-faster' : line.diffMs > 0 ? 'is-slower' : '', ref: t('telemetry.stintBlock.refWas', { time: formatLapTime(line.refMs) }) }
}))
// The box takes the colour of the best lap's verdict (the first line).
const howClass = computed(() => lines.value[0]?.cls ?? '')
</script>

<style scoped lang="scss">
.stint-block { padding: 12px; display: grid; gap: 8px; font-family: 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
.stint-block__tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.stint-block__tile { display: grid; gap: 4px; align-content: start; padding: 10px; border-radius: 6px; background: #ffffff0a; border: 1px solid #ffffff14; }
.stint-block__label { font: 600 10px/1.2 'Inter', sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #8a8a90; }
.stint-block__label--purple { color: #c084fc; }
.stint-block__big { font: 800 22px/1 'Inter', sans-serif; color: #fff; }
.stint-block__mid { font: 800 17px/1.1 'Inter', sans-serif; color: #fff; }
.stint-block__sub { font: 500 12px/1.3 'Inter', sans-serif; color: #b3b3b8; }
.stint-block__hint { font: 500 11px/1.3 'Inter', sans-serif; color: #8a8a90; }
.stint-block__bars { display: flex; gap: 3px;
  span { flex: 1; height: 6px; border-radius: 2px; background: #ffffff30; }
  span.is-on { background: #e6e6ea; }
}
.stint-block__how { display: grid; gap: 6px; padding: 10px 12px; border-radius: 6px; background: #ffffff0a; border: 1px solid #ffffff14;
  &.is-faster { background: #3ddc5a14; border-color: #3ddc5a4d; .stint-block__label { color: #3ddc5a; } }
  &.is-slower { background: #ff5a6e14; border-color: #ff5a6e4d; .stint-block__label { color: #ff5a6e; } }
}
.stint-block__line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px;
  strong { font: 800 15px/1.2 'Inter', sans-serif; color: #fff; }
  strong.is-faster { color: #3ddc5a; }
  strong.is-slower { color: #ff5a6e; }
}
.stint-block__line-name { font: 600 12px/1.2 'Inter', sans-serif; color: #e6e6ea; min-width: 84px; }
.stint-block__potential { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 6px; background: #c084fc14; border: 1px solid #c084fc40;
  strong { font: 800 16px/1 'Inter', sans-serif; color: #c084fc; }
}
.stint-block__potential-text { display: grid; gap: 2px; }
</style>
