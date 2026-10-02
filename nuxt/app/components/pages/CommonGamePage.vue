<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGameContext } from '~/composables/useGameContext'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { useTargetUserId } from '~/composables/usePilotContext'
import { gameLabel } from '~/services/telemetry/gameCatalog'
import type { SessionDocument } from '~/types/telemetry'
const props = defineProps<{ surface?: string; track?: string }>()
const { consultedGame } = useGameContext()
const gameId = computed(() => consultedGame.value)
const title = computed(() => gameLabel(gameId.value))
const gateway = useTelemetryGateway()
const targetUserId = useTargetUserId()
const sessions = ref<SessionDocument[]>([])
const loading = ref(false)
const error = ref(false)
const pageNumber = ref(1), hasNext = ref(false), hasPrev = ref(false)
let revision = 0
const timingSurface = computed(() => !props.surface || ['panoramica', 'piste'].includes(props.surface))
async function load(requestedPage = pageNumber.value) {
  const ticket = ++revision
  const uid = targetUserId.value
  sessions.value = []
  if (!uid) { loading.value = false; error.value = false; return }
  loading.value = true
  error.value = false
  try {
    const page = await gateway.getSessionsPage(uid, { gameId: gameId.value, track: props.track, hideEmpty: true }, requestedPage, 25)
    if (ticket !== revision) return
    sessions.value = page.sessions
    pageNumber.value = page.state?.currentPage ?? requestedPage
    hasNext.value = page.state?.hasNext === true
    hasPrev.value = page.state?.hasPrev === true
  } catch { if (ticket === revision) error.value = true }
  finally { if (ticket === revision) loading.value = false }
}
onMounted(() => watch([gameId, targetUserId, () => props.track], () => {
  pageNumber.value = 1; hasNext.value = false; hasPrev.value = false
  void load(1)
}, { immediate: true, flush: 'sync' }))
onBeforeUnmount(() => { revision++ })
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
      <p v-else-if="error" role="alert">Impossibile caricare le sessioni. <button @click="load()">Riprova</button></p>
      <p v-else-if="!sessions.length">Nessuna sessione registrata per questo gioco.</p>
      <ul v-else>
        <li v-for="session in sessions" :key="session.sessionId">
          <NuxtLink :to="`/sessioni/${session.sessionId}`">{{ session.meta.track }} · {{ session.meta.car }}</NuxtLink>
          <span>{{ session.meta.date_start }} · {{ session.summary.laps }} giri</span>
        </li>
      </ul>
      <nav v-if="hasPrev || hasNext" aria-label="Pagine sessioni">
        <button :disabled="loading || !hasPrev" @click="load(pageNumber - 1)">Precedenti</button>
        <span>Pagina {{ pageNumber }}</span>
        <button :disabled="loading || !hasNext" @click="load(pageNumber + 1)">Successive</button>
      </nav>
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
