<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ADMIN_TEST_OWNER_UIDS } from '~/utils/adminInstallationScope'
import { aggregateUsage, automationResult, filterUsage, usageDaily, usageHours, type UsageItem, type UsageDetail, type UsageFilter } from '~/utils/usageMetrics'
const props = defineProps<{ items: UsageItem[]; names: Record<string, string>; days: string[]; loading: boolean; updatedAt: number | null; error: string; selected: string; details: UsageDetail[]; detailLoading: boolean; detailError: string; preferences: Record<string, { enabled: boolean }> }>()
const emit = defineEmits<{ refresh: [period: 7 | 30]; select: [uid: string]; visible: [uids: string[]] }>()
const period = ref<7 | 30>(7), page = ref(1)
const filters = reactive<UsageFilter>({ query: '', game: '', mode: '', sessionType: '', version: '', channel: '', includeTests: false })
const filtered = computed(() => filterUsage(props.items, filters, props.names, ADMIN_TEST_OWNER_UIDS))
const users = computed(() => aggregateUsage(filtered.value))
const pages = computed(() => Math.max(1, Math.ceil(users.value.length / 25)))
const visible = computed(() => users.value.slice((page.value - 1) * 25, page.value * 25))
watch(filters, () => { page.value = 1 })
watch(visible, value => emit('visible', value.map(u => u.uid)), { immediate: true })
watch(pages, value => { if (page.value > value) page.value = value })
const totals = computed(() => ({ users: users.value.length, hours: users.value.reduce((n, u) => n + u.drivingMs, 0), sessions: users.value.reduce((n, u) => n + u.sessions.size, 0), verified: users.value.reduce((n, u) => n + (u.outcomes.verified || 0), 0) }))
const daily = computed(() => usageDaily(filtered.value, props.days))
const maxDaily = computed(() => Math.max(3600000, ...daily.value.map(d => d.drivingMs)))
const options = (field: 'game' | 'mode' | 'sessionType' | 'version' | 'channel') => [...new Set(props.items.map(i => i.summary?.context[field]).filter((s): s is string => !!s))].sort()
const time = (ms: number) => ms ? new Date(ms).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' }) : 'Dato mancante'
const resultLabel = (outcomes: Record<string, number>) => { const r = automationResult(outcomes); return r.percent === null ? 'Nessun esito verificabile' : `${r.verified}/${r.finished} · ${r.percent}%` }
const extraResults = (outcomes: Record<string, number>) => { const r = automationResult(outcomes); return `${r.rejected} rifiutate · ${r.ongoing} in corso · ${r.unknown} ignote` }
const categoryNames: Record<string, string> = { overlay: 'Overlay', voice: 'Avvisi vocali', pitwall: 'Pitwall', auto: 'Automazioni', stability: 'Stabilità', app: 'Applicazione', 'control-k': 'Pannello Control K', driving: 'Guida' }
const featureNames: Record<string, string> = {
  'overlay.tyres': 'Pneumatici', 'overlay.sectors': 'Settori', 'overlay.dashboard': 'Dashboard',
  'overlay.info': 'Informazioni', 'overlay.standings': 'Classifica', 'overlay.trackmap': 'Mappa', 'overlay.training': 'Allenamento',
  'voice.spotter': 'Voce allenamento', 'voice.coach': 'Coach e riferimenti', 'voice.laps': 'Tempi giro',
  'voice.pressure': 'Avvisi pressioni', 'voice.target': 'Giro obiettivo', 'voice.fuel': 'Avvisi carburante',
  'pitwall.driver': 'Pitwall pilota', 'pitwall.engineer': 'Pitwall ingegnere', 'auto.fuel': 'Carburante',
  'auto.pressure-estimate': 'Stima pressioni', 'auto.pressure-correction': 'Correzione pressioni', 'auto.pit-strategy': 'Strategia box',
}
const eventNames: Record<string, string> = { opens: 'Aperture', starts: 'Avvii', started: 'Avviate', verified: 'Verificate',
  completed: 'Completati', played: 'Riprodotti', failed: 'Falliti', partial: 'Parziali', interrupted: 'Interrotte',
  unknown: 'Esito ignoto', rejected: 'Rifiutate', cancelled: 'Annullate', enabled: 'Attivazioni', disabled: 'Disattivazioni',
  order: 'Ordini', crash: 'Crash confermati', 'unclean-exit': 'Chiusure anomale' }
function metricLabel(key: string) {
  if (featureNames[key] || categoryNames[key]) return featureNames[key] || categoryNames[key]
  const position = key.lastIndexOf('.'), base = key.slice(0, position), event = key.slice(position + 1)
  return `${featureNames[base] || categoryNames[base] || base} · ${eventNames[event] || event}`
}
const metricGroups = computed(() => {
  const groups: Record<string, Record<string, { count: number; ms: number }>> = {}
  for (const d of props.details) {
    for (const [key, n] of Object.entries(d.counters)) { const group = key.split('.')[0] || key; groups[group] ||= {}; (groups[group]![key] ||= { count: 0, ms: 0 }).count += n }
    for (const [key, n] of Object.entries(d.durations)) { const group = key.split('.')[0] || key; groups[group] ||= {}; (groups[group]![key] ||= { count: 0, ms: 0 }).ms += n }
  }
  return groups
})
const installations = computed(() => [...new Set(props.details.map(d => `${d.producer} · ${d.source} · ${d.context.version} / ${d.context.channel}`))])
const recent = computed(() => props.details.filter(d => d.sessions.length).sort((a, b) => b.lastAt - a.lastAt).slice(0, 12))
</script>
<template>
  <div class="usage-page" :aria-busy="loading">
    <header class="page-head"><div><h1>Utilizzo</h1><p>{{ days[0] }} — {{ days[days.length - 1] }} · Europe/Rome</p><p>Ultimo aggiornamento: {{ updatedAt ? time(updatedAt) : 'non ancora disponibile' }}</p></div><button :disabled="loading" @click="emit('refresh', period)">{{ loading ? 'Aggiornamento…' : 'Aggiorna' }}</button></header>
    <p v-if="error" class="warning" role="alert">{{ error }} <span v-if="updatedAt">Mostro l’ultimo risultato valido, non aggiornato.</span></p>
    <div class="filters">
      <label>Periodo<select v-model="period" :disabled="loading" @change="emit('refresh', period)"><option :value="7">7 giorni</option><option :value="30">30 giorni</option></select></label>
      <label>Cerca utente<input v-model="filters.query" type="search" placeholder="Nome o ID"></label>
      <label>Simulatore<select v-model="filters.game"><option value="">Tutti</option><option v-for="v in options('game')" :key="v">{{ v }}</option></select></label>
      <label>Modalità<select v-model="filters.mode"><option value="">Tutte</option><option value="singleplayer">Single player</option><option value="multiplayer">Multiplayer</option><option value="unknown">Sconosciuta</option></select></label>
      <label>Sessione<select v-model="filters.sessionType"><option value="">Tutte</option><option v-for="v in options('sessionType')" :key="v">{{ v }}</option></select></label>
      <details><summary>Altri filtri</summary><div class="extra-filters"><label>Versione<select v-model="filters.version"><option value="">Tutte</option><option v-for="v in options('version')" :key="v">{{ v }}</option></select></label><label>Canale<select v-model="filters.channel"><option value="">Tutti</option><option v-for="v in options('channel')" :key="v">{{ v }}</option></select></label><label class="check"><input v-model="filters.includeTests" type="checkbox"> Includi account di prova</label></div></details>
    </div>
    <div class="metrics"><article><span>Utenti con attività osservata</span><strong>{{ updatedAt ? totals.users : '—' }}</strong></article><article><span>Ore alla guida</span><strong>{{ updatedAt ? usageHours(totals.hours) : '—' }}</strong></article><article><span>Sessioni osservate</span><strong>{{ updatedAt ? totals.sessions : '—' }}</strong></article><article><span>Automazioni riuscite</span><strong>{{ updatedAt ? totals.verified : '—' }}</strong></article></div>
    <section class="chart" aria-label="Ore alla guida per giorno"><h2>Ore alla guida</h2><div class="bars"><div v-for="d in daily" :key="d.day" class="day" :title="d.observed ? 'Attività osservata' : 'Dato mancante'"><span class="value">{{ d.observed ? usageHours(d.drivingMs) : '—' }}</span><div class="bar-space"><div v-if="d.observed" class="bar" :style="{ height: `${100 * d.drivingMs / maxDaily}%` }" /></div><time :datetime="d.day">{{ d.day.slice(8) }}/{{ d.day.slice(5, 7) }}</time></div></div></section>
    <section class="users"><h2>Attività per utente <small>{{ users.length }}</small></h2><div class="table-scroll"><table><thead><tr><th>Utente</th><th>Ultima attività</th><th class="number">Ore guida</th><th class="number">Sessioni</th><th>Funzionalità</th><th>Automazioni</th><th>Copertura</th></tr></thead><tbody>
      <tr v-for="u in visible" :key="u.uid" :class="{ selected: selected === u.uid }"><td><button class="user-name" :aria-expanded="selected === u.uid" @click="emit('select', u.uid)">{{ names[u.uid] || u.uid }}</button></td><td>{{ time(u.lastAt) }}</td><td class="number">{{ usageHours(u.drivingMs) }}</td><td class="number">{{ u.sessions.size }}</td><td class="features">{{ [...u.features].map(metricLabel).join(', ') || 'Nessuna osservata' }}</td><td>{{ resultLabel(u.outcomes) }}<small>{{ extraResults(u.outcomes) }}</small></td><td>{{ preferences[u.uid]?.enabled === false ? 'Raccolta disattivata' : u.partial ? 'Parziale' : 'Osservata' }}</td></tr>
      <tr v-if="!visible.length"><td colspan="7">{{ loading ? 'Caricamento dei riepiloghi…' : 'Nessun dato per questi filtri. L’assenza di dati non equivale a zero utilizzi.' }}</td></tr>
    </tbody></table></div><nav class="pagination" aria-label="Pagine utenti"><button :disabled="page <= 1" @click="page--">Precedente</button><span>{{ page }} / {{ pages }}</span><button :disabled="page >= pages" @click="page++">Successiva</button></nav></section>
    <section v-if="selected" class="detail" aria-label="Dettaglio utente"><header><h2>{{ names[selected] || selected }}</h2><NuxtLink :to="`/admin-diagnostics?userId=${encodeURIComponent(selected)}`">Apri diagnostica</NuxtLink></header><p v-if="detailLoading" role="status">Caricamento dettaglio…</p><p v-else-if="detailError" role="alert" class="warning">{{ detailError }}</p><template v-else><p>Dettaglio dell’intero periodo selezionato per questo utente.</p><p v-if="preferences[selected]?.enabled === false">Raccolta disattivata. I riepiloghi già inviati scadono entro 30 giorni.</p><div class="detail-grid"><article v-for="(values, group) in metricGroups" :key="group"><h3>{{ categoryNames[group] || group }}</h3><dl><template v-for="(value, key) in values" :key="key"><dt>{{ metricLabel(key) }}</dt><dd>{{ value.ms ? `${usageHours(value.ms)} h` : value.count }}</dd></template></dl></article></div><h3>Sessioni recenti osservate</h3><ul><li v-for="(s, i) in recent" :key="i">{{ time(s.lastAt) }} · {{ s.context.game }} · {{ s.context.track }} · {{ s.context.car }} · {{ s.context.sessionType }} / {{ s.context.mode }}{{ s.partial ? ' · parziale' : '' }}</li></ul><h3>Installazioni e produttori</h3><ul class="identifiers"><li v-for="i in installations" :key="i">{{ i }}</li></ul></template></section>
    <p class="footnote">Solo attività raccolta dalle versioni con statistiche di utilizzo, schema 1. Nessuno storico ricostruito. I tempi Pitwall dell’ingegnere non sono ore di guida. Successi: risultati verificati sulle esecuzioni concluse con esito noto; rifiuti, esiti ignoti e operazioni in corso sono separati.</p>
  </div>
</template>
<style scoped lang="scss">
@use '@/assets/scss/variables' as *;
.usage-page { padding: 24px; max-width: var(--app-content-max-width); margin: auto; color: #eee; font-family: $font-primary; font-size: 13px; font-variant-numeric: tabular-nums; }
.page-head, .detail header { display:flex; justify-content:space-between; gap:16px; align-items:center; } h1 { font-size:24px; margin:0 0 8px; } h2 { font-size:16px; margin:0 0 16px; } h3 { font-size:14px; } p { color:#b2b6be; margin:8px 0; } small { display:block; color:#a0a5ae; margin-top:4px; } h2 small { display:inline; }
button, input, select { font:inherit; color:inherit; border:1px solid #ffffff26; border-radius:6px; background:#24262c; padding:8px 12px; } button { cursor:pointer; } button:disabled { opacity:.4; cursor:default; } button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline:2px solid $racing-orange; outline-offset:2px; }
.filters { display:flex; flex-wrap:wrap; gap:12px; align-items:end; margin:24px 0; } label { display:flex; flex-direction:column; gap:6px; color:#b2b6be; } .check { flex-direction:row; align-items:center; } .extra-filters { display:flex; gap:12px; padding-top:12px; flex-wrap:wrap; } summary { cursor:pointer; padding:10px 0; }
.metrics { display:grid; grid-template-columns:repeat(4,1fr); border-block:1px solid #ffffff20; margin-bottom:24px; } .metrics article { padding:20px 16px; } .metrics span { color:#b2b6be; } .metrics strong { display:block; font-size:28px; font-weight:500; margin-top:8px; }
.chart, .users, .detail { border:1px solid #ffffff18; background:#11131880; padding:16px; margin-bottom:24px; border-radius:8px; } .bars { display:flex; gap:8px; overflow-x:auto; } .day { flex:1; min-width:28px; text-align:center; } .bar-space { height:100px; display:flex; align-items:end; justify-content:center; margin:8px 0; } .bar { width:70%; background:$racing-orange; min-height:1px; } time,.value { font-size:11px; color:#b2b6be; }
.table-scroll { overflow-x:auto; } table { width:100%; border-collapse:collapse; } th { text-align:left; font-weight:500; color:#a0a5ae; white-space:nowrap; } th, td { padding:12px 8px; border-bottom:1px solid #ffffff14; vertical-align:top; } .number { text-align:right; } .features { max-width:240px; overflow-wrap:anywhere; } .user-name { background:none; border:0; padding:0; text-align:left; color:inherit; } tr.selected { background:rgba($racing-orange,.07); } tbody tr:hover { background:#ffffff05; } .pagination { display:flex; justify-content:end; align-items:center; gap:12px; margin-top:16px; }
.warning { color:#f5bc6b; padding:12px 0; } a { color:$racing-orange; } .detail-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:24px; } dl { display:grid; grid-template-columns:1fr auto; gap:8px; } dt { overflow-wrap:anywhere; color:#b2b6be; } dd { margin:0; } li { margin:8px 0; } .identifiers { font-family:monospace; overflow-wrap:anywhere; } .footnote { font-size:12px; line-height:1.6; }
@media(max-width:800px) { .usage-page { padding:16px; } .metrics { grid-template-columns:repeat(2,1fr); } .page-head { align-items:start; } }
</style>
