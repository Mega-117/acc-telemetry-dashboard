<script setup lang="ts">
// Catch-all route: redirect any unknown route to panoramica
const router = useRouter()

onMounted(() => {
  router.replace('/panoramica')
})
</script>

<template>
  <div class="redirect-screen">
    <p>Reindirizzamento...</p>
  </div>
</template>

<style scoped>
.redirect-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #0d0d12;
  color: rgba(255, 255, 255, 0.5);
  font-family: 'Inter', sans-serif;
}
</style>
