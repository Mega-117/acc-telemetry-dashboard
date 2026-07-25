<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  loadRecentClientDiagnostics,
  type ClientDiagnosticItem
} from '~/repositories/clientDiagnosticsRepository'

definePageMeta({
  layout: 'coach',
  middleware: ['admin-only']
})

const events = ref<ClientDiagnosticItem[]>([])
const isLoading = ref(true)
const errorMessage = ref('')
const componentFilter = ref('all')
const severityFilter = ref('all')
const selected = ref<ClientDiagnosticItem | null>(null)

const components = computed(() => [...new Set(events.value.map((event) => event.component))].sort())
const filteredEvents = computed(() => events.value.filter((event) => {
  return (componentFilter.value === 'all' || event.component === componentFilter.value)
    && (severityFilter.value === 'all' || event.severity === severityFilter.value)
}))

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('it-IT')
}

async function loadEvents() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    events.value = await loadRecentClientDiagnostics()
  } catch (error: any) {
    errorMessage.value = error?.message || 'Impossibile caricare la diagnostica.'
  } finally {
    isLoading.value = false
  }
}

onMounted(loadEvents)
</script>

<template>
  <div class="diagnostics-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">SYSTEM MONITORING</p>
        <h1>Diagnostica client</h1>
        <p>Errori sanitizzati ricevuti da frontend, Electron, launcher, updater e logger.</p>
      </div>
      <button class="refresh-button" :disabled="isLoading" @click="loadEvents">
        Aggiorna
      </button>
    </header>

    <section class="filters">
      <label>
        Componente
        <select v-model="componentFilter">
          <option value="all">Tutti</option>
          <option v-for="component in components" :key="component" :value="component">
            {{ component }}
          </option>
        </select>
      </label>
      <label>
        Severità
        <select v-model="severityFilter">
          <option value="all">Tutte</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
          <option value="fatal">Fatal</option>
        </select>
      </label>
      <span>{{ filteredEvents.length }} eventi</span>
    </section>

    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
    <p v-else-if="isLoading" class="empty-state">Caricamento diagnostica…</p>
    <p v-else-if="filteredEvents.length === 0" class="empty-state">Nessun errore registrato.</p>

    <div v-else class="event-list">
      <article
        v-for="event in filteredEvents"
        :key="event.eventId"
        class="event-card"
        role="button"
        tabindex="0"
        @click="selected = event"
        @keydown.enter="selected = event"
        @keydown.space.prevent="selected = event"
      >
        <span class="severity" :class="`severity--${event.severity}`">{{ event.severity }}</span>
        <span class="event-main">
          <strong>{{ event.component }} · {{ event.code }}</strong>
          <span>{{ event.message }}</span>
          <small>
            {{ formatDate(event.occurredAt) }} · v{{ event.suiteVersion || '?' }}
            · {{ event.channel || 'canale sconosciuto' }}
          </small>
        </span>
        <NuxtLink class="pilot-link" :to="`/piloti/${event.userId}`" @click.stop>
          {{ event.userId.slice(0, 8) }}…
        </NuxtLink>
      </article>
    </div>

    <div v-if="selected" class="detail-backdrop" @click.self="selected = null">
      <article class="detail-card">
        <button class="detail-close" @click="selected = null">×</button>
        <p class="eyebrow">{{ selected.component }} · {{ selected.severity }}</p>
        <h2>{{ selected.code }}</h2>
        <p>{{ selected.message }}</p>
        <dl>
          <dt>Utente</dt><dd>{{ selected.userId }}</dd>
          <dt>Versione</dt><dd>{{ selected.suiteVersion || 'sconosciuta' }}</dd>
          <dt>Fingerprint</dt><dd>{{ selected.fingerprint }}</dd>
          <dt>Ricevuto</dt><dd>{{ formatDate(selected.receivedAt) }}</dd>
        </dl>
        <pre v-if="selected.stack">{{ selected.stack }}</pre>
        <pre v-if="Object.keys(selected.context || {}).length">{{ JSON.stringify(selected.context, null, 2) }}</pre>
      </article>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.diagnostics-page { color: #fff; }
.page-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 24px; }
.page-header h1 { margin: 4px 0 8px; font-family: $font-primary; font-size: 32px; }
.page-header p { margin: 0; color: rgba(255,255,255,.55); }
.eyebrow { color: #a78bfa !important; font-size: 11px; font-weight: 800; letter-spacing: 1.8px; }
.refresh-button, select { border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.07); color: #fff; border-radius: 8px; padding: 10px 14px; }
.filters { display: flex; align-items: end; gap: 16px; padding: 16px; margin-bottom: 16px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; }
.filters label { display: grid; gap: 6px; color: rgba(255,255,255,.55); font-size: 11px; }
.filters span { margin-left: auto; color: rgba(255,255,255,.45); }
.event-list { display: grid; gap: 8px; }
.event-card { display: grid; grid-template-columns: 70px 1fr auto; gap: 14px; align-items: center; width: 100%; padding: 14px; color: #fff; text-align: left; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; cursor: pointer; }
.event-card:hover { border-color: rgba(167,139,250,.5); }
.severity { padding: 5px 7px; border-radius: 6px; font-size: 10px; font-weight: 800; text-align: center; text-transform: uppercase; background: rgba(239,68,68,.15); color: #fca5a5; }
.severity--warning { background: rgba(234,179,8,.15); color: #fde047; }
.severity--fatal { background: rgba(239,68,68,.28); color: #fff; }
.event-main { display: grid; gap: 4px; min-width: 0; }
.event-main > span { overflow: hidden; color: rgba(255,255,255,.7); text-overflow: ellipsis; white-space: nowrap; }
.event-main small { color: rgba(255,255,255,.4); }
.pilot-link { color: #a78bfa; font-family: monospace; font-size: 11px; }
.empty-state, .error-banner { padding: 28px; text-align: center; color: rgba(255,255,255,.55); }
.error-banner { color: #fca5a5; }
.detail-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: rgba(0,0,0,.72); }
.detail-card { position: relative; width: min(760px, 100%); max-height: 85vh; overflow: auto; padding: 24px; background: #11111b; border: 1px solid rgba(167,139,250,.35); border-radius: 14px; }
.detail-close { position: absolute; top: 10px; right: 14px; border: 0; background: transparent; color: #fff; font-size: 28px; cursor: pointer; }
.detail-card dl { display: grid; grid-template-columns: 100px 1fr; gap: 8px; margin: 20px 0; }
.detail-card dt { color: rgba(255,255,255,.4); }
.detail-card dd { margin: 0; word-break: break-all; }
.detail-card pre { padding: 14px; overflow: auto; white-space: pre-wrap; background: #09090f; border-radius: 8px; color: #c4b5fd; }
</style>
