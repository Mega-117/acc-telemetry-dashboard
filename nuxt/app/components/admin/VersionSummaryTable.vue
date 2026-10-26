<script setup lang="ts">
// PIP-631: per ogni versione e canale, installazioni attive e problemi del periodo.
import { channelLabel, type VersionRow } from '~/utils/adminVersionSummary'

defineProps<{ rows: VersionRow[], periodDays: number }>()
</script>

<template>
  <section class="versions" aria-labelledby="versions-title">
    <h2 id="versions-title">Per versione · ultimi {{ periodDays }} giorni</h2>
    <table v-if="rows.length">
      <thead>
        <tr><th>Canale</th><th>Versione</th><th title="Installazioni reali attive su questa versione">Installazioni</th><th title="Chiusure improvvise con file di crash">Crash</th><th title="App bloccata per qualche secondo">Blocchi</th><th>Altre anomalie</th><th title="Errori ed errori gravi segnalati">Errori</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.key">
          <td>{{ channelLabel(r.channel) }}</td><td class="mono">{{ r.version }}</td><td>{{ r.installations }}</td>
          <td :class="{ bad: r.crashes }">{{ r.crashes }}</td><td :class="{ warn: r.stalls }">{{ r.stalls }}</td>
          <td :class="{ warn: r.otherAnomalies }">{{ r.otherAnomalies }}</td><td :class="{ warn: r.errors }">{{ r.errors }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">Nessun dato nel periodo.</p>
  </section>
</template>

<style scoped lang="scss">
.versions { margin: 16px 0; padding: 14px 16px; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 10px; }
.versions h2 { margin: 0 0 10px; font-size: 15px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
th { text-align: left; font-weight: 500; color: rgba(255, 255, 255, 0.6); padding: 4px 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.2); }
td { padding: 5px 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.07); }
.mono { font-family: ui-monospace, monospace; }
.bad { color: #f87171; font-weight: 700; }
.warn { color: #fbbf24; }
.empty { color: rgba(255, 255, 255, 0.6); font-size: 13px; }
</style>
