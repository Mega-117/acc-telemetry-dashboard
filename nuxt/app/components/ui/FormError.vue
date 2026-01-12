<script setup lang="ts">
// ============================================
// FormError - Messaggio errore form
// ============================================

interface Props {
  message: string
  visible?: boolean
}

withDefaults(defineProps<Props>(), {
  visible: false
})
</script>

<template>
  <div 
    v-if="visible && message" 
    class="form-error"
  >
    {{ message }}
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/scss/variables' as *;

.form-error {
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: $radius-md;
  color: var(--accent-danger-light, #f87171);
  font-size: $font-size-sm;
  line-height: 1.4;
  text-align: center;
  animation: errorShake 0.4s ease;
}

@keyframes errorShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
</style>
