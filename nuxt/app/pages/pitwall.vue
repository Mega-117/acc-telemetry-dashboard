<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useGameContext } from '~/composables/useGameContext'
import { gameUiSupport, gameLabel } from '~/services/telemetry/gameCatalog'
import { useI18n } from '~/i18n'
const { t } = useI18n()
const { consultedGame } = useGameContext()
const available = computed(() => gameUiSupport(consultedGame.value).pitwall)
const PitwallAvailablePage = defineAsyncComponent(() => import('~/components/pitwall/PitwallAvailablePage.vue').then(module => module.default))
definePageMeta({ layout: 'dashboard' })
</script>

<template>
  <div class="pitwall-route-boundary">
  <PitwallAvailablePage v-if="available" />
  <section v-else class="pitwall-unavailable" data-testid="pitwall-unavailable">
    <h1>Pitwall</h1>
    <h2>{{ t('pitwall.unavailable.title') }}</h2>
    <p>{{ t('pitwall.unavailable.body', { game: gameLabel(consultedGame) }) }}</p>
    <p>{{ t('pitwall.unavailable.hint') }}</p>
  </section>
  </div>
</template>

<style scoped>
.pitwall-unavailable { max-width: 720px; margin: 64px auto; padding: 32px; border: 1px solid #353535; background: #101012; }
h1 { font-size: 16px; text-transform: uppercase; color: #aaa; margin: 0 0 24px; }
h2 { font-size: 28px; margin: 0 0 16px; }
p { color: #aaa; line-height: 1.6; }
</style>
