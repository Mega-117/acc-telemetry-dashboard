<script setup lang="ts">
// PIP-623: pannello "Archivio giri": soglie R2 (piano gratuito), interruttore, giri al giorno,
// piloti, rifiuti e ultimo scarico locale. Solo presentazione: i dati arrivano dalla pagina.
import { computed } from 'vue'
import { LAPS_DISABLE_RATIO, reasonLabel, type LapsArchiveModel } from '~/repositories/lapsArchiveRepository'

const props = defineProps<{ model: LapsArchiveModel | null, names: Record<string, string>, loading: boolean, error: string, switching: boolean }>()
const emit = defineEmits<{ refresh: [], switch: [mode: 'auto' | 'off'] }>()

const maxDay = computed(() => Math.max(1, ...(props.model?.days ?? []).map(d => d.uploads)))
const threshold = LAPS_DISABLE_RATIO * 50
const when = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`
const amount = (key: string, value: number) => key === 'storage' ? bytes(value) : value.toLocaleString('it-IT')
const syncAge = computed(() => {
  const at = Date.parse(props.model?.lastSync?.at ?? '')
  return Number.isFinite(at) ? Math.floor((Date.now() - at) / 86400000) : null
})
</script>

<template>
  <section class="laps-admin">
    <header class="page-head">
      <h1>Archivio giri</h1>
      <button type="button" :disabled="loading" @click="emit('refresh')">{{ loading ? 'Aggiorno…' : 'Aggiorna' }}</button>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <template v-if="model">
      <div class="status" :class="{ off: !model.enabled }">
        <strong>{{ model.enabled ? 'Caricamenti attivi' : 'Caricamenti spenti' }}</strong>
        <span>{{ reasonLabel(model.reason) }} · controllo consumi {{ when(model.checkedAt) }}</span>
        <button type="button" :disabled="switching" @click="emit('switch', model.reason === 'admin-off' ? 'auto' : 'off')">
          {{ model.reason === 'admin-off' ? 'Riaccendi (automatico)' : 'Spegni ora' }}
        </button>
      </div>
      <p class="note">Percentuali sul piano gratuito R2 dell'intero account (giri + diagnostica). Oltre il {{ threshold }}% tutte le scritture si spengono da sole.</p>
      <div class="metrics">
        <article v-for="u in model.usage" :key="u.key" :class="{ warn: (u.percent ?? 0) >= threshold }">
          <span>{{ u.label }}</span>
          <strong>{{ u.percent === null ? '—' : `${u.percent}%` }}</strong>
          <small>{{ amount(u.key, u.value) }}</small>
        </article>
        <article>
          <span>Ultimo scarico locale</span>
          <strong :class="{ late: syncAge !== null && syncAge > 20 }">{{ syncAge === null ? 'mai' : syncAge === 0 ? 'oggi' : `${syncAge} g fa` }}</strong>
          <small>{{ model.lastSync ? `${model.lastSync.downloaded ?? 0} scaricati${model.lastSync.complete ? '' : ' · incompleto'}` : 'lancia sync_laps_archive.py' }}</small>
        </article>
      </div>
      <p v-if="model.forecast" class="note">A questo ritmo ({{ model.forecast.uploadsPerDay }} giri al giorno) lo spazio dei giri si ferma a circa {{ model.forecast.storagePercent }}% e le loro scritture a {{ model.forecast.classAPercent }}% al mese. Stima, solo giri.</p>
      <h2>Giri caricati, ultimi 30 giorni</h2>
      <div class="chart" role="img" :aria-label="`Giri caricati al giorno, massimo ${maxDay}`">
        <div v-for="d in model.days" :key="d.day" class="bar" :title="`${d.day}: ${d.uploads} giri, ${d.shares} condivisioni`">
          <i :style="{ height: `${(d.uploads / maxDay) * 100}%` }" />
        </div>
      </div>
      <p v-if="model.truncated" class="note">Riepilogo parziale: troppi contatori, mostrati i primi.</p>
      <div class="tables">
        <table>
          <thead><tr><th>Pilota</th><th>Giri</th><th>Condivisi</th></tr></thead>
          <tbody>
            <tr v-for="p in model.pilots" :key="p.uid"><td>{{ names[p.uid] || p.uid }}</td><td>{{ p.uploads }}</td><td>{{ p.shares }}</td></tr>
            <tr v-if="!model.pilots.length"><td colspan="3">Nessun giro negli ultimi 30 giorni.</td></tr>
          </tbody>
        </table>
        <table>
          <thead><tr><th>Rifiuti{{ model.rejectionsTruncated ? ' (parziale)' : '' }}</th><th>Piloti-giorno</th></tr></thead>
          <tbody>
            <tr v-for="r in model.rejections" :key="r.reason"><td>{{ r.reason }}</td><td>{{ r.count }}</td></tr>
            <tr v-if="!model.rejections.length"><td colspan="2">Nessun rifiuto.</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.laps-admin { display: grid; gap: 14px; color: #e6e6ea; }
.page-head { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  h1 { margin: 0; font: italic 700 22px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; }
  button { height: 34px; padding: 0 14px; border: 1px solid #ffffff2e; background: #ffffff0a; color: #e6e6ea; font: 700 12px 'Inter', sans-serif; cursor: pointer; } }
h2 { margin: 6px 0 0; font: italic 700 14px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; }
.error { color: #ff5a6e; margin: 0; }
.note { margin: 0; color: #8a8a90; font-size: 12px; }
.status { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px; border: 1px solid #3ddc5a66; background: #3ddc5a12;
  strong { color: #3ddc5a; } span { color: #b3b3b8; font-size: 13px; }
  button { margin-left: auto; height: 32px; padding: 0 12px; border: 1px solid #ffffff2e; background: #ffffff0a; color: #e6e6ea; font: 700 12px 'Inter', sans-serif; cursor: pointer; }
  &.off { border-color: #ff5a6e66; background: #ff5a6e12; strong { color: #ff5a6e; } } }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px;
  article { display: grid; gap: 4px; padding: 12px; border: 1px solid #ffffff1f; background: #ffffff06;
    span { color: #8a8a90; font-size: 12px; } strong { font: 700 24px 'Inter', sans-serif; font-variant-numeric: tabular-nums; } small { color: #b3b3b8; }
    &.warn strong, strong.late { color: #ff5a6e; } } }
.chart { display: grid; grid-template-columns: repeat(30, 1fr); gap: 3px; align-items: end; height: 120px; padding: 8px; border: 1px solid #ffffff1f; background: #ffffff06;
  .bar { height: 100%; display: flex; align-items: flex-end; i { display: block; width: 100%; min-height: 1px; background: #38bdf8; } } }
.tables { display: grid; grid-template-columns: 2fr 1fr; gap: 12px;
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #8a8a90; font-size: 11px; text-transform: uppercase; padding: 6px; border-bottom: 1px solid #ffffff1f; }
  td { padding: 6px; border-bottom: 1px solid #ffffff0d; font-variant-numeric: tabular-nums; } }
@media (max-width: 900px) { .metrics { grid-template-columns: repeat(2, 1fr); } .tables { grid-template-columns: 1fr; } }
</style>
