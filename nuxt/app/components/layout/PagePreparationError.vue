<script setup lang="ts">
defineEmits<{ retry: [] }>()
</script>
<template>
  <LayoutPageContainer class="page-preparation-error">
    <div role="status">
      <p>Non è stato possibile preparare la pagina.</p>
      <button type="button" class="racing-button" @click="$emit('retry')">Riprova</button>
    </div>
  </LayoutPageContainer>
</template>
<style scoped>
.page-preparation-error { display: grid; place-items: center; text-align: center; }
</style>
