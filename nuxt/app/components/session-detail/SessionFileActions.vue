<script setup lang="ts">
defineProps<{ canShare: boolean; sharing: boolean; success: boolean; error: string | null }>()
defineEmits<{ share: [] }>()
</script>
<template>
  <!-- Sharing only: the JSON export was dropped from the page (2026-10-25). -->
  <div class="session-file-actions">
    <button v-if="canShare" type="button" :disabled="sharing" @click="$emit('share')">
      {{ sharing ? 'Condivisione…' : 'Condividi' }}
    </button>
    <span v-if="success" role="status">Link copiato!</span>
    <span v-if="error" role="alert">{{ error }}</span>
  </div>
</template>
<style scoped>
/* Same square buttons as the Telemetria bar. */
.session-file-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
button { height: 28px; padding: 0 12px; border: 1px solid #ffffff2e; background: #ffffff0a; color: #e6e6ea; font: 700 12px 'Inter', sans-serif; cursor: pointer; }
button:hover:not(:disabled) { border-color: #ff0024; }
button:disabled { opacity: .5; cursor: wait; }
[role="status"] { color: #3ddc5a; font-size: 12px; }
[role="alert"] { color: #ff5a6e; font-size: 12px; }
</style>
