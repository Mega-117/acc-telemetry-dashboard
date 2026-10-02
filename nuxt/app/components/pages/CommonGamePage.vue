<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGameContext } from '~/composables/useGameContext'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { useTargetUserId } from '~/composables/usePilotContext'
import { gameLabel } from '~/services/telemetry/gameCatalog'
import type { SessionDocument } from '~/types/telemetry'
import type { buildCommonHistoryOverview } from '~/services/telemetry/gameProjection'
import { formatLapTime, formatDriveTime } from '~/utils/telemetryFormat'
const props = defineProps<{ surface?: string; track?: string; embedded?: boolean }>()
const emit = defineEmits<{ 'go-to-session': [id: string]; 'go-to-track': [track: string]; 'open-sessions': [] }>()
const { consultedGame } = useGameContext()
const gameId = computed(() => consultedGame.value)
const title = computed(() => gameLabel(gameId.value))
const gateway = useTelemetryGateway()
const targetUserId = useTargetUserId()
const sessions = ref<SessionDocument[]>([])
const loading = ref(false)
const error = ref(false)
const pageNumber = ref(1), hasNext = ref(false), hasPrev = ref(false)
const overview = ref<ReturnType<typeof buildCommonHistoryOverview> | null>(null)
const overviewLoading = ref(false)
let overviewRevision = 0
let revision = 0
const timingSurface = computed(() => !props.surface || ['panoramica', 'piste'].includes(props.surface))
const kindLabels: Record<string, string> = { practice: 'Pratica', qualify: 'Qualifica', race: 'Gara', time_attack: 'Time attack', cruise: 'Guida libera', unknown: 'Tipo non disponibile' }
const kindLabel = (kind: string) => kindLabels[kind] ?? kind
async function loadOverview() {
  const ticket = ++overviewRevision
  overview.value = null
  const uid = targetUserId.value
  if (!uid) { overviewLoading.value = false; return }
  overviewLoading.value = true
  try {
    const result = await gateway.getCommonHistoryOverview(uid, gameId.value, props.track)
    if (ticket === overviewRevision) overview.value = result
  } catch { /* History remains independently available when the complete index is missing. */ }
  finally { if (ticket === overviewRevision) overviewLoading.value = false }
}
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
  void loadOverview()
}, { immediate: true, flush: 'sync' }))
onBeforeUnmount(() => { revision++; overviewRevision++ })
</script>

<template>
  <section class="common-game racing-data">
    <p class="eyebrow">GIOCO CONSULTATO</p>
    <h1>{{ title }}</h1>
    <p v-if="gameId === 'evo'">Connettore sperimentale: la disponibilità dei dati dipende dalla versione del gioco.</p>
    <p v-if="!timingSurface">I dati registrati di {{ title }} sono disponibili qui. Le funzioni in tempo reale dipendono dai dati del gioco connesso.</p>
    <p v-if="overviewLoading" role="status">Caricamento riepilogo…</p>
    <div v-else-if="overview" class="common-overview">
      <dl class="common-totals" aria-label="Riepilogo del gioco consultato">
        <div><dt>Sessioni</dt><dd>{{ overview.sessions }}</dd></div>
        <div><dt>Giri registrati</dt><dd>{{ overview.laps }}</dd></div>
        <div><dt>Giri validi</dt><dd>{{ overview.validLaps }}</dd></div>
        <div><dt>Tempo registrato</dt><dd>{{ formatDriveTime(overview.totalTimeMs) }}</dd></div>
      </dl>
      <section v-if="Object.keys(overview.activity).length" aria-label="Attività ultimi sette giorni">
        <h2>Ultimi 7 giorni</h2>
        <ul><li v-for="(activity, kind) in overview.activity" :key="kind"><strong>{{ kindLabel(kind) }}</strong><span>{{ activity.sessions }} sessioni · {{ activity.minutes }} min</span></li></ul>
      </section>
      <section v-if="overview.groups.length" aria-label="Risultati per pista e vettura">
        <h2>Piste e vetture</h2>
        <div class="common-table-scroll"><table>
          <thead><tr><th>Pista / variante</th><th>Vettura</th><th>Sessioni</th><th>Giri validi</th><th>Miglior giro valido</th></tr></thead>
          <tbody><tr v-for="group in overview.groups" :key="group.key">
            <td><button v-if="embedded" @click="emit('go-to-track', group.track)">{{ group.track }}</button><NuxtLink v-else :to="`/piste/${encodeURIComponent(group.track)}`">{{ group.track }}</NuxtLink><span v-if="group.variant"> · {{ group.variant }}</span></td><td>{{ group.car }}</td>
            <td>{{ group.sessions }}</td><td>{{ group.validLaps }}</td><td>{{ group.bestMs === null ? '—' : formatLapTime(group.bestMs) }}</td>
          </tr></tbody>
        </table></div>
      </section>
    </div>
    <p v-else class="overview-unavailable">Riepilogo completo non disponibile. <button @click="loadOverview()">Riprova riepilogo</button></p>
    <div class="common-history">
      <h2>{{ track || 'Sessioni recenti' }}</h2>
      <p v-if="loading" role="status">Caricamento sessioni…</p>
      <p v-else-if="error" role="alert">Impossibile caricare le sessioni. <button @click="load()">Riprova</button></p>
      <p v-else-if="!sessions.length">Nessuna sessione registrata per questo gioco.</p>
      <ul v-else>
        <li v-for="session in sessions" :key="session.sessionId">
          <button v-if="embedded" @click="emit('go-to-session', session.sessionId)">{{ session.meta.track }} · {{ session.meta.car }}</button>
          <NuxtLink v-else :to="`/sessioni/${session.sessionId}`">{{ session.meta.track }} · {{ session.meta.car }}</NuxtLink>
          <span>{{ session.meta.date_start }} · {{ session.summary.laps }} giri</span>
        </li>
      </ul>
      <nav v-if="hasPrev || hasNext" aria-label="Pagine sessioni">
        <button :disabled="loading || !hasPrev" @click="load(pageNumber - 1)">Precedenti</button>
        <span>Pagina {{ pageNumber }}</span>
        <button :disabled="loading || !hasNext" @click="load(pageNumber + 1)">Successive</button>
      </nav>
    </div>
    <button v-if="embedded" @click="emit('open-sessions')">Apri Sessioni</button>
    <NuxtLink v-else to="/sessioni">Apri Sessioni</NuxtLink>
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
.common-totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin: 24px 0; }
.common-totals > div { border: 1px solid var(--racing-data-line); padding: 16px; }
dt { color: var(--racing-data-muted); font-size: 12px; } dd { margin: 8px 0 0; font-size: 26px; }
.common-table-scroll { overflow-x: auto; } table { width: 100%; border-collapse: collapse; text-align: left; }
th, td { padding: 12px; border-bottom: 1px solid var(--racing-data-line); } th { font-size: 12px; color: var(--racing-data-muted); }
.common-overview section { margin-bottom: 28px; }
</style>
