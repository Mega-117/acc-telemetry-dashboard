<script setup lang="ts">
import { useGameContext } from '~/composables/useGameContext'
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

function handleGoToSession(sessionId: string, routePath?: string) {
  navigateTo(routePath || `/sessioni/${sessionId}`)
}
</script>

<template>
  <PagesCommonGamePage v-if="useGameContext().consultedGame.value !== 'acc'" surface="piste" :track="trackId" />
  <PagesTrackDetailPage v-else
    :track-id="trackId"
    :from-session="fromSession"
    @back="handleBack"
    @go-to-session="handleGoToSession"
  />
</template>
