<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  middleware: () => navigateTo('/panoramica')
})
</script>

<template>
  <PagesPilotAreaPage />
</template>
