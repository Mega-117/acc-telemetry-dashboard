<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useGameContext } from '~/composables/useGameContext'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { usePilotContext } from '~/composables/usePilotContext'
import { gameLabel } from '~/services/telemetry/gameCatalog'
import type { SessionDocument } from '~/types/telemetry'
const props = defineProps<{ surface?: string; track?: string }>()
const { consultedGame } = useGameContext()
const gameId = consultedGame.value
const title = gameLabel(gameId)
const gateway = useTelemetryGateway()
const targetUserId = usePilotContext()
const sessions = ref<SessionDocument[]>([])
const loading = ref(false)
const error = ref(false)
const timingSurface = computed(() => !props.surface || ['panoramica', 'piste'].includes(props.surface))
async function load() {
  loading.value = true
  error.value = false
  try {
    const page = await gateway.getSessionsPage(targetUserId.value || undefined, { gameId, track: props.track, hideEmpty: true }, 1, 25)
    sessions.value = page.sessions
  } catch { error.value = true } finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <section class="common-game racing-data">
    <p class="eyebrow">GIOCO CONSULTATO</p>
    <h1>{{ title }}</h1>
    <p v-if="gameId === 'evo'">Connettore sperimentale: la disponibilità dei dati dipende dalla versione del gioco.</p>
    <p v-if="!timingSurface">I dati registrati di {{ title }} sono disponibili qui. Le funzioni in tempo reale dipendono dai dati del gioco connesso.</p>
    <template>
      <h2>{{ track || 'Sessioni recenti' }}</h2>
      <p v-if="loading" role="status">Caricamento sessioni…</p>
      <p v-else-if="error" role="alert">Impossibile caricare le sessioni. <button @click="load">Riprova</button></p>
      <p v-else-if="!sessions.length">Nessuna sessione registrata per questo gioco.</p>
      <ul v-else>
        <li v-for="session in sessions" :key="session.sessionId">
          <NuxtLink :to="`/sessioni/${session.sessionId}`">{{ session.meta.track }} · {{ session.meta.car }}</NuxtLink>
          <span>{{ session.meta.date_start }} · {{ session.summary.laps }} giri</span>
        </li>
      </ul>
    </template>
    <NuxtLink to="/sessioni">Apri Sessioni</NuxtLink>
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as controls;
.common-game { @include controls.tokens; padding: 28px; }
.eyebrow { color: var(--racing-data-muted); font-size: 11px; letter-spacing: .1em; }
h1 { margin: 6px 0 20px; } h2 { font-size: 18px; }
ul { list-style: none; padding: 0; }
li { padding: 16px 0; border-bottom: 1px solid var(--racing-data-line); display: flex; justify-content: space-between; gap: 18px; }
li span { color: var(--racing-data-muted); font-size: 12px; }
a { color: inherit; } p { max-width: 70ch; line-height: 1.6; }
</style>
