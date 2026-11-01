<script setup lang="ts">
// PIP-653: Condividi with its icon; the outcome goes to the site's notification column (no text beside the
// button, which moved Condividi and Confronta sideways).
import { useI18n } from '~/i18n'
defineProps<{ canShare: boolean; sharing: boolean; iconOnly?: boolean }>()
defineEmits<{ share: [] }>()
const { t } = useI18n()
</script>
<template>
  <!-- Sharing only: the JSON export was dropped from the page (2026-10-25). -->
  <!-- 01/11: icon only in the lap views (the pills share the row); the name stays for screen readers and in the tooltip. -->
  <button v-if="canShare" type="button" class="rc-btn rc-btn--compact" :class="{ 'icon-only': iconOnly }" :disabled="sharing" :aria-busy="sharing" :title="t('sessionDetail.share.title')"
    :aria-label="iconOnly ? (sharing ? t('sessionDetail.share.sharing') : t('sessionDetail.share.label')) : undefined" @click="$emit('share')">
    <UiRacingIcon name="share" :size="16" /><template v-if="!iconOnly">{{ sharing ? t('sessionDetail.share.sharing') : t('sessionDetail.share.label') }}</template>
  </button>
</template>
<style scoped>
button:disabled { cursor: wait; }
.icon-only { padding-left: 9px; padding-right: 9px; }
</style>
