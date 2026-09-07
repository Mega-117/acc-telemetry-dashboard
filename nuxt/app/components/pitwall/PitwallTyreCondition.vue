<script setup lang="ts">
import { computed } from 'vue'
import { boundPitwallTyreCondition } from '~/services/pitwall/pitwallLink'
const props = defineProps<{ tyreSet: number | null, condition?: unknown, fresh: boolean }>()
const observation = computed(() => {
  const value = boundPitwallTyreCondition(props.condition)
  return props.fresh && value?.tyreSet === props.tyreSet && value.state !== 'unknown' ? value : null
})
</script>
<template>
  <span class="tyre-condition">
    <b><span v-if="observation">{{ observation.state === 'new' ? 'Nuovo' : 'Usato' }} · </span>{{ tyreSet ?? '—' }}</b>
    <span class="tyre-condition__sources">
      <em>{{ fresh && tyreSet != null ? 'LIVE' : 'N/D' }}</em>
      <em v-if="observation" :title="`Condizione letta a schermo: ${observation.observedAt}`">A SCHERMO</em>
    </span>
    <small v-if="!observation">Stato non verificato</small>
  </span>
</template>
<style scoped>
.tyre-condition { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.tyre-condition b { white-space: nowrap; font-variant-numeric: tabular-nums; }
.tyre-condition__sources { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
.tyre-condition em { font-size: 8px; font-style: normal; color: #40dfc5; border: 1px solid #287d79; border-radius: 3px; padding: 1px 4px; }
.tyre-condition small { color: #9ca9b8; font-size: 10px; }
</style>
