<script setup lang="ts">
defineProps<{ canShare: boolean; sharing: boolean; success: boolean; error: string | null }>()
defineEmits<{ share: []; export: [] }>()
</script>
<template>
  <div class="session-file-actions">
    <button type="button" @click="$emit('export')">Esporta JSON</button>
    <button v-if="canShare" type="button" :disabled="sharing" @click="$emit('share')">
      {{ sharing ? 'Condivisione…' : 'Condividi' }}
    </button>
    <span v-if="success" role="status">Link copiato!</span>
    <span v-if="error" role="alert">{{ error }}</span>
  </div>
</template>
<style scoped>
.session-file-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; }
button { border: 1px solid #52525b; border-radius: 6px; padding: 8px 14px; color: inherit; background: #27272a; cursor: pointer; }
button:disabled { opacity: .5; cursor: wait; }
[role="alert"] { color: #fca5a5; }
</style>
