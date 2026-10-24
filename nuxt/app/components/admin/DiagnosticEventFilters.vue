<script setup lang="ts">
import { CLIENT_DIAGNOSTIC_CHANNEL_OPTIONS } from '~/repositories/clientDiagnosticsRepository'

// Filtri per uguaglianza della Diagnostica (PIP-540). Ogni combinazione ha il
// suo indice Firestore: aggiungere un filtro qui richiede anche gli indici.
defineProps<{ componentOptions: string[], versionOptions: string[] }>()
const component = defineModel<string>('component', { required: true })
const severity = defineModel<string>('severity', { required: true })
const channel = defineModel<string>('channel', { required: true })
const version = defineModel<string>('version', { required: true })
</script>

<template>
  <div class="event-filters">
    <label>
      Componente
      <select v-model="component">
        <option value="all">Tutti i componenti</option>
        <option v-for="item in componentOptions" :key="item" :value="item">{{ item }}</option>
      </select>
    </label>
    <label>
      Severità
      <select v-model="severity">
        <option value="all">Tutte le severità</option>
        <option value="warning">Warning</option>
        <option value="error">Error</option>
        <option value="fatal">Fatal</option>
      </select>
    </label>
    <label>
      Canale
      <select v-model="channel" data-testid="channel-filter">
        <option value="all">Tutti i canali</option>
        <option v-for="item in CLIENT_DIAGNOSTIC_CHANNEL_OPTIONS" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select>
    </label>
    <label>
      Versione
      <input
        v-model.lazy="version"
        data-testid="version-filter"
        list="diagnostic-versions"
        placeholder="Tutte (es. 0.5.0-dev.4)"
      >
      <datalist id="diagnostic-versions">
        <option v-for="item in versionOptions" :key="item" :value="item" />
      </datalist>
    </label>
  </div>
</template>

<style scoped>
/* display: contents tiene i campi nella stessa riga flessibile dei filtri della pagina. */
.event-filters { display: contents; }
label { display: grid; gap: 6px; color: rgba(255,255,255,.65); font-size: 11px; }
select, input { border: 1px solid rgba(255,255,255,.15); background: #1b1b27; color: #fff; border-radius: 8px; padding: 10px 14px; color-scheme: dark; }
select option { color: #fff; background: #11111b; }
</style>
