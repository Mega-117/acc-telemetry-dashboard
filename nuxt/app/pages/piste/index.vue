<script setup lang="ts">
definePageMeta({
  layout: 'dashboard'
})
</script>

<template>
  <PagesPistePage @go-to-track="navigateTo(`/piste/${$event}`)" />
</template>
