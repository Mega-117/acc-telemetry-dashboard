<script setup lang="ts">
// PIP-653: Condividi with its icon; the outcome goes to the site's notification column (no text beside the
// button, which moved Condividi and Confronta sideways).
import { useI18n } from '~/i18n'
defineProps<{ canShare: boolean; sharing: boolean }>()
defineEmits<{ share: [] }>()
const { t } = useI18n()
</script>
<template>
  <!-- Sharing only: the JSON export was dropped from the page (2026-10-25). -->
  <button v-if="canShare" type="button" class="rc-btn rc-btn--compact" :disabled="sharing" :title="t('sessionDetail.share.title')" @click="$emit('share')">
    <UiRacingIcon name="share" :size="16" />{{ sharing ? t('sessionDetail.share.sharing') : t('sessionDetail.share.label') }}
  </button>
</template>
<style scoped>
button:disabled { cursor: wait; }
</style>
