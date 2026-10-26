<script setup lang="ts">
// PIP-619: Statistiche di attivita', aperte dal bottone della Panoramica (solo ACC).
import { useGameContext } from '~/composables/useGameContext'
definePageMeta({
  layout: 'dashboard'
})
const router = useRouter()
const { consultedGame } = useGameContext()
</script>

<template>
  <PagesStatistichePage v-if="consultedGame === 'acc'" @back="router.push('/panoramica')" />
  <LayoutPageContainer v-else><p>Le statistiche per ora sono disponibili solo per ACC.</p></LayoutPageContainer>
</template>
