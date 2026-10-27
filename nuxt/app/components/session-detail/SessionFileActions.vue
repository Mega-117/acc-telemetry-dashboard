<script setup lang="ts">
// PIP-653: Condividi with its icon; the outcome goes to the site's notification column (no text beside the
// button, which moved Condividi and Confronta sideways).
defineProps<{ canShare: boolean; sharing: boolean }>()
defineEmits<{ share: [] }>()
</script>
<template>
  <!-- Sharing only: the JSON export was dropped from the page (2026-10-25). -->
  <button v-if="canShare" type="button" class="rc-btn rc-btn--compact" :disabled="sharing" title="Copia il link della sessione: chi lo apre vede Sessione e Telemetria" @click="$emit('share')">
    <UiRacingIcon name="share" :size="16" />{{ sharing ? 'Condivisione…' : 'Condividi' }}
  </button>
</template>
<style scoped>
button:disabled { cursor: wait; }
</style>
