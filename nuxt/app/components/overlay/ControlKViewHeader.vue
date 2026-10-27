<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { useI18n } from '~/i18n'

// PIP-556: the same header for every Control K view: the ← arrow (same as the
// wheel Back: leaves without saving), the title with its context, and an
// optional slot on the right (pager, session).
defineProps<{ title: string; subtitle?: string | null; action: string }>()
const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
</script>

<template>
  <header class="ck-view-header">
    <button type="button" class="ck-view-back" :data-overlay-wheel-action="action" :aria-label="t('controlK.back')" :title="t('controlK.back')" @click="emit('back')">
      <ArrowLeft :size="16" aria-hidden="true" />
    </button>
    <div class="ck-view-title"><strong>{{ title }}</strong><small v-if="subtitle">{{ subtitle }}</small></div>
    <div v-if="$slots.default" class="ck-view-tools"><slot /></div>
  </header>
</template>

<style scoped>
.ck-view-header { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid #ffffff25; }
.ck-view-back { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 1px solid #ffffff30; border-radius: 0; background: #ffffff08; color: #eee; cursor: pointer; }
.ck-view-back:hover { background: #ffffff14; }
.ck-view-title { display: grid; min-width: 0; }
.ck-view-title strong { font-size: 14px; font-weight: 600; color: #fff; }
.ck-view-title small { overflow: hidden; color: #aaa; font-size: 11px; white-space: nowrap; text-overflow: ellipsis; }
.ck-view-tools { display: flex; align-items: center; gap: 8px; }
</style>
