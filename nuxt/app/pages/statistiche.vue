<script setup lang="ts">
// PIP-619: Statistiche di attivita', aperte dal bottone della Panoramica (solo ACC).
import { useGameContext } from '~/composables/useGameContext'
import { useI18n } from '~/i18n'
definePageMeta({
  layout: 'dashboard'
})
const router = useRouter()
const { consultedGame } = useGameContext()
const { t } = useI18n()
</script>

<template>
  <PagesStatistichePage v-if="consultedGame === 'acc'" @back="router.push('/panoramica')" />
  <LayoutPageContainer v-else><p>{{ t('stats.accOnly') }}</p></LayoutPageContainer>
</template>
