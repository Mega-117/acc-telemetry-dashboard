<script setup lang="ts">
definePageMeta({
  layout: 'dashboard'
})

const route = useRoute()
const trackId = computed(() => route.params.id as string)
const fromSession = computed(() => route.query.from as string | undefined)

function handleBack() {
  if (fromSession.value) {
    navigateTo(`/sessioni/${fromSession.value}`)
  } else {
    navigateTo('/piste')
  }
}
</script>

<template>
  <PagesTrackDetailPage 
    :track-id="trackId"
    :from-session="fromSession"
    @back="handleBack"
  />
</template>
