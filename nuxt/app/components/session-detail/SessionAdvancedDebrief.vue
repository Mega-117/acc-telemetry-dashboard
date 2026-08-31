<script setup lang="ts">
// Orchestratore del super-mockup debrief allenamento (PIP-361).
// Ogni banda vive in un componente dedicato sotto ./advanced; i valori sono
// dimostrativi ("Mock esplorativo"), nessun numero deriva da dati reali.
// Spec: docs/wiki/research/2026-08-31-dashboard-debrief-allenamento-spec.md.
import AdvancedDebriefActions from '~/components/session-detail/advanced/AdvancedDebriefActions.vue'
import AdvancedDebriefContext from '~/components/session-detail/advanced/AdvancedDebriefContext.vue'
import AdvancedDebriefHistory from '~/components/session-detail/advanced/AdvancedDebriefHistory.vue'
import AdvancedDebriefStintsPace from '~/components/session-detail/advanced/AdvancedDebriefStintsPace.vue'
import AdvancedDebriefTrackAnalysis from '~/components/session-detail/advanced/AdvancedDebriefTrackAnalysis.vue'

defineProps<{
  usableLaps?: number
  totalLaps?: number
}>()
</script>

<template>
  <div
    class="adv-debrief"
    data-testid="session-advanced-debrief"
  >
    <AdvancedDebriefContext
      :usable-laps="usableLaps"
      :total-laps="totalLaps"
    />
    <AdvancedDebriefStintsPace />
    <AdvancedDebriefTrackAnalysis />
    <AdvancedDebriefActions />
    <AdvancedDebriefHistory />
  </div>
</template>

<style scoped lang="scss">
.adv-debrief {
  display: grid;
  gap: 14px;
  color: #f5f7fb;
}
</style>
