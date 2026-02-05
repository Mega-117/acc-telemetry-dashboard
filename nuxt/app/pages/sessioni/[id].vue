<script setup lang="ts">
definePageMeta({
  layout: 'dashboard'
})

const route = useRoute()
const sessionId = computed(() => route.params.id as string)
// Get userId from query param for shared session viewing
const externalUserId = computed(() => route.query.userId as string | undefined)
</script>

<template>
  <PagesSessionDetailPage 
    :session-id="sessionId"
    :external-user-id="externalUserId"
    @back="navigateTo('/sessioni')"
    @go-to-track="(trackId: string) => navigateTo(`/piste/${trackId}?from=${sessionId}`)"
  />
</template>

