<script setup lang="ts">
// PIP-705: the old pilot area is gone; old links land on Panoramica.
definePageMeta({
  layout: 'dashboard',
  middleware: () => navigateTo('/panoramica')
})
</script>

<template>
  <div />
</template>
