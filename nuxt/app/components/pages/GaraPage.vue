<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameContext } from '~/composables/useGameContext'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useOverlayRegionApi } from '~/composables/useOverlayRegionApi'
import { commonContextKey } from '~/services/telemetry/commonLive'
import { calculateRacePlan, racePlanLiveInputs } from '~/services/telemetry/racePlan'
import { gameLabel } from '~/services/telemetry/gameCatalog'

const router = useRouter(), route = useRoute()
const { consultedGame } = useGameContext()
const { fastState, startFastStatePolling, stopFastStatePolling } = useFastStatePoller(useOverlayRegionApi())
onMounted(startFastStatePolling)
onBeforeUnmount(stopFastStatePolling)
const query = (name: string) => typeof route.query[name] === 'string' ? route.query[name] as string : ''
const pista = ref(query('pista')), auto = ref(query('auto')), variante = ref('')
const durataMinuti = ref<number | string>(60), tempoGiro = ref<number | string>('')
const consumo = ref<number | string>(''), riservaGiri = ref<number | string>(0), soste = ref<number | string>(0)
const importedSource = ref<string | null>(null)
const live = computed(() => racePlanLiveInputs(fastState.value.commonLive, consultedGame.value))
const number = (value: number | string) => value === '' ? null : Number(value)
const plan = computed(() => calculateRacePlan({ durationMinutes: number(durataMinuti.value), lapSeconds: number(tempoGiro.value),
  fuelPerLap: number(consumo.value), reserveLaps: number(riservaGiri.value) ?? NaN, stops: number(soste.value) ?? NaN }))
const liters = (value: number | null) => value === null ? '—' : `${value.toFixed(1)} L`
function useLiveInputs() {
  const inputs = live.value
  if (!inputs) return
  pista.value = inputs.track; auto.value = inputs.car; variante.value = inputs.variant ?? ''
  tempoGiro.value = inputs.lapSeconds ?? ''; consumo.value = inputs.fuelPerLap ?? ''
  importedSource.value = commonContextKey(fastState.value.commonLive)
}
function clearContext() {
  pista.value = ''; auto.value = ''; variante.value = ''; tempoGiro.value = ''; consumo.value = ''
  importedSource.value = null
}
watch(consultedGame, clearContext)
watch(() => commonContextKey(fastState.value.commonLive), key => {
  if (importedSource.value && key !== importedSource.value) clearContext()
})
</script>

<template>
  <LayoutPageContainer>
    <div class="gara-header">
      <button class="nav-btn" @click="router.push('/panoramica')">Torna alla Home</button>
      <h1 class="page-title">Preparazione Gara · {{ gameLabel(consultedGame) }}</h1>
      <p class="subtitle">Pianifica durata, passo e carichi dai tuoi parametri.</p>
    </div>
    <div class="gara-layout">
      <div class="gara-sidebar card-panel">
        <h2 class="section-title">Parametri Evento</h2>
        <button class="nav-btn" :disabled="!live" @click="useLiveInputs">Usa dati del gioco connesso</button>
        <p v-if="!live" role="status">Nessuna sorgente aggiornata per il gioco consultato. Puoi inserire i parametri manualmente.</p>
        <div class="form-group"><label for="race-track">Pista</label><input id="race-track" v-model="pista" class="form-control"></div>
        <div class="form-group"><label for="race-variant">Variante</label><input id="race-variant" v-model="variante" class="form-control"></div>
        <div class="form-group"><label for="race-car">Auto</label><input id="race-car" v-model="auto" class="form-control"></div>
        <div class="form-group"><label for="race-duration">Durata gara (minuti)</label><input id="race-duration" v-model="durataMinuti" type="number" min="1" class="form-control"></div>
        <div class="form-group"><label for="race-pace">Passo previsto (secondi per giro)</label><input id="race-pace" v-model="tempoGiro" type="number" min="0.001" step="0.001" placeholder="es. 108.500" class="form-control"></div>
        <div class="form-group"><label for="race-fuel">Consumo (litri per giro)</label><input id="race-fuel" v-model="consumo" type="number" min="0.001" step="0.01" placeholder="Se disponibile" class="form-control"></div>
        <div class="form-group"><label for="race-stops">Soste pianificate</label><input id="race-stops" v-model="soste" type="number" min="0" max="20" class="form-control"></div>
        <div class="form-group"><label for="race-reserve">Giri di riserva per stint</label><input id="race-reserve" v-model="riservaGiri" type="number" min="0" max="100" class="form-control"></div>
      </div>
      <div class="gara-content">
        <div class="insight-banner card-panel">
          <h2 class="section-title">Piano stimato</h2>
          <p>{{ pista || 'Pista da scegliere' }}{{ variante ? ` · ${variante}` : '' }} · {{ auto || 'Auto da scegliere' }}</p>
          <p>Ripartizione uniforme dei giri tra le soste scelte. Verifica regolamento, capienza del serbatoio, rifornimenti e gomme per il tuo evento.</p>
          <p v-if="importedSource">Parametri copiati dalla sessione connessa; puoi correggerli per la gara.</p>
        </div>
        <div class="stats-grid">
          <div class="stat-card"><span class="stat-label">Giri stimati</span><span class="stat-value" data-test="race-laps">{{ plan.laps ?? '—' }}</span></div>
          <div class="stat-card"><span class="stat-label">Carichi totali, riserva inclusa</span><span class="stat-value" data-test="race-fuel">{{ liters(plan.fuel) }}</span></div>
        </div>
        <p v-if="plan.laps === null" role="status">Inserisci durata, passo e un numero di soste compatibile con i giri stimati.</p>
        <p v-else-if="plan.fuel === null" role="status">Consumo non disponibile: la stima dei giri resta utilizzabile.</p>
        <div v-if="plan.stints.length" class="card-panel">
          <h3 class="subsection-title">Stint pianificati</h3>
          <table class="data-table"><thead><tr><th>Stint</th><th>Giri</th><th>Carico con riserva</th></tr></thead>
            <tbody><tr v-for="stint in plan.stints" :key="stint.id"><td>{{ stint.id }}</td><td>{{ stint.laps }}</td><td>{{ liters(stint.fuel) }}</td></tr></tbody>
          </table>
        </div>
        <div class="card-panel checklist"><h3 class="subsection-title">Prima della gara</h3><ul>
          <li><label><input type="checkbox"> Regolamento e soste verificati</label></li>
          <li><label><input type="checkbox"> Parametri provati con la stessa auto e variante</label></li>
          <li><label><input type="checkbox"> Comandi disponibili verificati nel gioco</label></li>
        </ul></div>
      </div>
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
.gara-header {
  margin-bottom: var(--spacing-xl, 24px);
}
.page-title {
  font-size: 32px;
  color: var(--text-primary);
  margin: 16px 0 8px 0;
}
.subtitle {
  color: var(--text-secondary);
  font-size: 18px;
}
.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  font-size: 16px;
  
  svg {
    width: 18px;
    height: 18px;
  }
  
  &:hover {
    color: var(--text-primary);
  }
}

.gara-layout {
  display: grid;
  grid-template-columns: 350px 1fr;
  gap: var(--spacing-xl, 24px);
}

@media (max-width: 900px) {
  .gara-layout {
    grid-template-columns: 1fr;
  }
}

.card-panel {
  background: var(--bg-card, #1a1a1a);
  border: 1px solid var(--border-color, #333);
  border-radius: var(--radius-lg, 12px);
  padding: var(--spacing-xl, 24px);
  margin-bottom: var(--spacing-lg, 16px);
}

.section-title {
  font-size: 20px;
  color: var(--text-primary);
  margin-bottom: 20px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color, #333);
  padding-bottom: 10px;
}

.subsection-title {
  font-size: 18px;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 20px;
  
  label {
    display: block;
    margin-bottom: 8px;
    color: var(--text-secondary);
    font-size: 14px;
  }
}

.form-control {
  width: 100%;
  background: var(--bg-surface, #242424);
  border: 1px solid var(--border-color, #333);
  color: var(--text-primary);
  padding: 12px;
  border-radius: var(--radius-md, 8px);
  font-size: 16px;
  
  &:focus {
    outline: none;
    border-color: var(--accent-primary, #ffd700);
  }
}

.checkbox-group {
  display: flex;
  align-items: center;
  gap: 12px;
  
  input[type="checkbox"] {
    width: 20px;
    height: 20px;
    accent-color: var(--accent-primary, #ffd700);
  }
  
  label {
    margin: 0;
    font-size: 16px;
    color: var(--text-primary);
    cursor: pointer;
  }
}

.insight-banner {
  background: rgba(16, 185, 129, 0.05);
  border-left: 4px solid #10b981;
  
  .section-title {
    border: none;
    margin-bottom: 8px;
    padding: 0;
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 16px;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-lg, 16px);
  margin-bottom: var(--spacing-lg, 16px);
}

.stat-card {
  background: var(--bg-card, #1a1a1a);
  border: 1px solid var(--border-color, #333);
  border-radius: var(--radius-lg, 12px);
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  
  &.highlight {
    border-color: var(--accent-primary, #ffd700);
    background: rgba(255, 215, 0, 0.05);
  }
}

.stat-label {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 700;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  
  th {
    text-align: left;
    padding: 12px;
    color: var(--text-muted);
    font-weight: normal;
    font-size: 14px;
    border-bottom: 1px solid var(--border-color, #333);
  }
  
  td {
    padding: 16px 12px;
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-color, #333);
    font-size: 16px;
  }
  
  tbody tr:last-child td {
    border-bottom: none;
  }
}

.checklist {
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border-color, #333);
    color: var(--text-primary);
    font-size: 16px;
    
    &:last-child {
      border-bottom: none;
    }
  }
  
  input[type="checkbox"] {
    width: 20px;
    height: 20px;
    accent-color: var(--accent-primary, #ffd700);
  }
}
</style>
