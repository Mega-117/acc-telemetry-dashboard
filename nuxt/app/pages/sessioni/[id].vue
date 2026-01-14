<script setup lang="ts">
definePageMeta({
  layout: 'dashboard'
})

const route = useRoute()
const sessionId = computed(() => route.params.id as string)
</script>

<template>
  <PagesSessionDetailPage 
    :session-id="sessionId" 
    @back="navigateTo('/sessioni')"
  />
</template>
