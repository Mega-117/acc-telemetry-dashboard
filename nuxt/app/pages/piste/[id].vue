<script setup lang="ts">
definePageMeta({
  layout: 'dashboard'
})

const route = useRoute()
const trackId = computed(() => route.params.id as string)
</script>

<template>
  <PagesTrackDetailPage 
    :track-id="trackId" 
    @back="navigateTo('/piste')"
  />
</template>
