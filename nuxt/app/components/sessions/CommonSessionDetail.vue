<script setup lang="ts">
import { computed } from 'vue'
import { commonSessionPresentation } from '~/services/telemetry/commonSessionPresentation'
const props = defineProps<{ session: unknown }>()
const model = computed(() => commonSessionPresentation(props.session))
</script>

<template>
  <section class="common-session racing-data">
    <template v-if="model">
      <p class="eyebrow">{{ model.game }} · SESSIONE</p>
      <h1>{{ model.track }}</h1>
      <p>{{ model.car }} · {{ model.date }}</p>
      <div class="racing-table-scroll">
        <table class="racing-day-table">
          <caption>Tempi registrati</caption>
          <thead><tr><th>Giro</th><th>Tempo</th><th>Registrazione</th><th>Validità</th><th>Settori disponibili</th></tr></thead>
          <tbody><tr v-for="lap in model.laps" :key="lap.number">
            <td>{{ lap.number }}</td><td>{{ lap.time }}</td><td>{{ lap.completeness }}</td><td>{{ lap.validity }}</td>
            <td><span v-for="(sector, index) in lap.sectors" :key="index" class="sector">S{{ index + 1 }} {{ sector }}</span><span v-if="!lap.sectors.length">Non disponibili</span></td>
          </tr></tbody>
        </table>
      </div>
      <p class="availability">— indica un tempo non disponibile. La validità sconosciuta non è considerata valida nei best.</p>
    </template>
    <p v-else>Formato sessione non supportato.</p>
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as controls;
.common-session { @include controls.tokens; padding: 28px; }
h1 { margin: 6px 0; }
.eyebrow, .availability { color: var(--racing-data-muted); }
.eyebrow { font-size: 11px; letter-spacing: .1em; }
.sector { display: inline-block; margin-right: 18px; font-variant-numeric: tabular-nums; }
th { text-align: left; }
.availability { font-size: 12px; margin-top: 20px; }
</style>
