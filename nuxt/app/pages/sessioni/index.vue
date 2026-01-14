<script setup lang="ts">
definePageMeta({
  layout: 'dashboard'
})
</script>

<template>
  <PagesSessioniPage @go-to-session="navigateTo(`/sessioni/${$event}`)" />
</template>
