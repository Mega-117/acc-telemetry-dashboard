<script setup lang="ts">
import { computed } from 'vue'
import { boundPitwallTyreCondition } from '~/services/pitwall/pitwallLink'
import { useI18n } from '~/i18n'
const { t } = useI18n()
const props = defineProps<{ tyreSet: number | null, condition?: unknown, fresh: boolean }>()
const observation = computed(() => {
  const value = boundPitwallTyreCondition(props.condition)
  return props.fresh && value?.tyreSet === props.tyreSet && value.state !== 'unknown' ? value : null
})
</script>
<template>
  <span class="tyre-condition">
    <b><span v-if="observation">{{ observation.state === 'new' ? t('pitwall.tyreCondition.new') : t('pitwall.tyreCondition.used') }} · </span>{{ tyreSet ?? '—' }}</b>
    <span class="tyre-condition__sources">
      <em>{{ fresh && tyreSet != null ? t('pitwall.tyreCondition.live') : t('pitwall.tyreCondition.notAvailable') }}</em>
      <em v-if="observation" :title="t('pitwall.tyreCondition.onScreenTitle', { time: observation.observedAt })">{{ t('pitwall.tyreCondition.onScreen') }}</em>
    </span>
    <small v-if="!observation">{{ t('pitwall.tyreCondition.unverified') }}</small>
  </span>
</template>
<style scoped>
.tyre-condition { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.tyre-condition b { white-space: nowrap; font-variant-numeric: tabular-nums; }
.tyre-condition__sources { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
.tyre-condition em { font-size: 8px; font-style: normal; color: #40dfc5; border: 1px solid #287d79; border-radius: 3px; padding: 1px 4px; }
.tyre-condition small { color: #9ca9b8; font-size: 10px; }
</style>
