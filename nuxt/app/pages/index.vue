<script setup lang="ts">
// Redirect root to panoramica
definePageMeta({
  layout: false
})

// Redirect on mount
onMounted(() => {
  navigateTo('/panoramica')
})
</script>

<template>
  <div class="loading-redirect">
    <div class="loading-spinner"></div>
  </div>
</template>

<style scoped>
.loading-redirect {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0d0d12;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #e10600;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
