<template>
  <section class="stint-block" :aria-label="t('telemetry.stintBlock.stint', { n: facts.stint })">
    <header class="stint-block__head">
      <h4>{{ t('telemetry.stintBlock.stint', { n: facts.stint }) }}</h4>
      <span class="stint-block__meta">{{ kindText }}</span>
    </header>
    <div class="stint-block__rows">
      <template v-if="lines.length">
        <div class="stint-block__row stint-block__row--head" aria-hidden="true">
          <span />
          <span>{{ t('telemetry.stintBlock.colRef') }}</span>
          <span>{{ t('telemetry.stintBlock.colDiff') }}</span>
        </div>
        <div v-for="line in lines" :key="line.which" class="stint-block__row" data-testid="stint-block-line">
          <span class="stint-block__name">{{ t(`telemetry.stintBlock.row.${line.which}`) }}</span>
          <span class="stint-block__cell">{{ formatLapTime(line.refMs) }}</span>
          <span class="stint-block__gap" :style="{ background: deltaHeat(line.diffMs / 1000) }" :title="line.title">{{ formatDelta(line.diffMs / 1000) }}</span>
        </div>
      </template>
      <p v-else class="stint-block__note">{{ t('telemetry.stintBlock.noRef') }}</p>
      <div v-if="facts.theoreticalMs !== null" class="stint-block__row stint-block__row--wide">
        <span class="stint-block__name">{{ t('telemetry.stintBlock.row.potential') }}</span>
        <span class="stint-block__cell stint-block__cell--purple" :title="t('telemetry.stintBlock.potentialHint')">{{ formatLapTime(facts.theoreticalMs) }}</span>
      </div>
    </div>
    <p v-if="lines.length" class="stint-block__note">{{ t('telemetry.stintBlock.howHint') }}</p>
  </section>
</template>

<script setup lang="ts">
// dev.11 (user 05/11, G2 made minimal in the Racer Core style of the Settori box): which stint, the fuel,
// your stint best (and race average) against the Sessione page's RIFERIMENTO - its numbers handed over,
// never recomputed here - with the loss/gain cell of the sectors, and your potential (the theoretical lap).
import { computed } from 'vue'
import { stintVerdict, type StintFacts, type StintSummary } from '~/services/telemetry/stintBlock'
import { formatLapTime } from '~/utils/telemetryFormat'
import { formatDelta } from '~/services/telemetry/lapAnalysis'
import { deltaHeat } from '~/utils/deltaHeat'
import { useI18n } from '~/i18n'

const props = defineProps<{ facts: StintFacts, summary?: StintSummary | null }>()
const { t } = useI18n()

// 05/11 (user): no fuel and no lap count here, only the kind.
const kind = computed(() => props.summary?.kind ?? props.facts.kind)
const kindText = computed(() => kind.value ? t(`telemetry.stintBlock.kind.${kind.value}`) : '')
const lines = computed(() => stintVerdict(props.summary).map(line => ({ ...line,
  title: t(line.diffMs < 0 ? 'telemetry.stintBlock.faster' : line.diffMs > 0 ? 'telemetry.stintBlock.slower' : 'telemetry.stintBlock.same',
    { s: (Math.abs(line.diffMs) / 1000).toFixed(3) }) })))
</script>

<style scoped lang="scss">
// The Settori box (SessionAnalysisPanel .side-box / .sector-row): Racer Display title and names, flat cells, red/green gap.
// 05/11 (user): rows of their own height - never stretched to fill the frame under the map, empty space below is fine.
.stint-block { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid #ffffff1f; background: #ffffff06; font-variant-numeric: tabular-nums; }
.stint-block__head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  h4 { margin: 0; color: #fff; font: italic 700 14px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: .02em; }
}
.stint-block__meta { color: #a1a1a8; font: 700 11px 'Inter', sans-serif; text-transform: uppercase; letter-spacing: .04em; }
.stint-block__rows { display: grid; grid-template-rows: auto; grid-auto-rows: 34px; gap: 3px; }
.stint-block__row { display: grid; grid-template-columns: 104px 1fr 1fr; gap: 3px;
  &--wide { grid-template-columns: 104px 1fr; }
  &--head { color: #a1a1a8; font: 700 11px 'Inter', sans-serif; text-transform: uppercase; letter-spacing: .04em; text-align: center; }
}
.stint-block__name { display: grid; place-items: center; padding: 6px 0; background: #ffffff0d; color: #fff; font: italic 700 13px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; }
.stint-block__cell { display: grid; place-items: center; background: #ffffff08; color: #e6e6ea; font: 600 14px 'Inter', sans-serif;
  &--purple { color: #c084fc; font-size: 15px; font-weight: 700; }
}
.stint-block__gap { display: grid; place-items: center; color: #fff; font: 700 14px 'Inter', sans-serif; }
.stint-block__note { flex: none; margin: 0; color: #8a8a90; font: 500 11px/1.35 'Inter', sans-serif; }
</style>
