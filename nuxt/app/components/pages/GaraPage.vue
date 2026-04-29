<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'

const router = useRouter()
const route = useRoute()
const telemetryGateway = useTelemetryGateway()
void telemetryGateway

const getQueryValue = (value: unknown, fallback: string) => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0].trim()
  return fallback
}

const baseTrackOptions = ['Monza', 'Spa-Francorchamps', 'Imola', 'Paul Ricard', 'Suzuka']
const baseCarOptions = ['Ferrari 296 GT3', 'McLaren 720S GT3 Evo', 'Porsche 992 GT3 R', 'Aston Martin V8 Vantage GT3']

const optionMatches = (options: string[], selected: string) => {
  const normalizedSelected = selected.trim().toLowerCase()
  return options.some(option => option.trim().toLowerCase() === normalizedSelected)
}

const canonicalOption = (options: string[], selected: string) => {
  return options.find(option => option.trim().toLowerCase() === selected.trim().toLowerCase()) || selected
}

// Form Data
const pista = ref(canonicalOption(baseTrackOptions, getQueryValue(route.query.pista, 'Monza')))
const durataMinuti = ref(60)
const sostaObbligatoria = ref(true)
const auto = ref(canonicalOption(baseCarOptions, getQueryValue(route.query.auto, 'Ferrari 296 GT3')))
const targetPasso = ref('1:48.500')

const trackOptions = computed(() => {
  return optionMatches(baseTrackOptions, pista.value) ? baseTrackOptions : [pista.value, ...baseTrackOptions]
})

const carOptions = computed(() => {
  return optionMatches(baseCarOptions, auto.value) ? baseCarOptions : [auto.value, ...baseCarOptions]
})

const selectedTrackLabel = computed(() => {
  return baseTrackOptions.find(option => option.trim().toLowerCase() === pista.value.trim().toLowerCase()) || pista.value
})

const selectedCarLabel = computed(() => {
  return baseCarOptions.find(option => option.trim().toLowerCase() === auto.value.trim().toLowerCase()) || auto.value
})

// Fuel Estimation (mock logic for MVP)
const consumoMedio = ref(3.1) // L/lap
const tempoGiroStimato = ref(108) // 1:48 in seconds
const extraGiri = ref(2)

const giriTotali = computed(() => {
  return Math.ceil((durataMinuti.value * 60) / tempoGiroStimato.value)
})

const fuelTotale = computed(() => {
  return Math.ceil((giriTotali.value + extraGiri.value) * consumoMedio.value)
})

const fuelPerStint = computed(() => {
  if (sostaObbligatoria.value) {
    return Math.ceil(fuelTotale.value / 2) + 5 // +5L margin per stint
  }
  return fuelTotale.value
})

const stintPlan = computed(() => {
  if (sostaObbligatoria.value) {
    return [
      { id: 1, type: 'Start', fuel: fuelPerStint.value, laps: Math.ceil(giriTotali.value / 2), tires: 'Nuove' },
      { id: 2, type: 'Pit Stop', fuel: fuelPerStint.value, laps: giriTotali.value - Math.ceil(giriTotali.value / 2), tires: 'Nuove' }
    ]
  } else {
    return [
      { id: 1, type: 'Race', fuel: fuelTotale.value, laps: giriTotali.value, tires: 'Nuove' }
    ]
  }
})
</script>

<template>
  <LayoutPageContainer>
    <div class="gara-header">
      <button class="nav-btn" @click="router.push('/panoramica')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        Torna alla Home
      </button>
      <h1 class="page-title">Preparazione Gara</h1>
      <p class="subtitle">Pianifica la tua strategia e definisci i target.</p>
    </div>

    <div class="gara-layout">
      <!-- SINISTRA: Parametri -->
      <div class="gara-sidebar card-panel">
        <h2 class="section-title">Parametri Evento</h2>
        
        <div class="form-group">
          <label>Pista</label>
          <select v-model="pista" class="form-control">
            <option v-for="trackOption in trackOptions" :key="trackOption">{{ trackOption }}</option>
          </select>
        </div>

        <div class="form-group">
          <label>Auto</label>
          <select v-model="auto" class="form-control">
            <option v-for="carOption in carOptions" :key="carOption">{{ carOption }}</option>
          </select>
        </div>

        <div class="form-group">
          <label>Durata Gara (minuti)</label>
          <input type="number" v-model="durataMinuti" class="form-control" />
        </div>

        <div class="form-group checkbox-group">
          <input type="checkbox" id="pit" v-model="sostaObbligatoria" />
          <label for="pit">Sosta Obbligatoria (Cambio Gomme)</label>
        </div>

        <div class="form-group">
          <label>Target Passo Gara</label>
          <input type="text" v-model="targetPasso" class="form-control" placeholder="es. 1:48.500" />
        </div>
      </div>

      <!-- DESTRA: Strategia Generata -->
      <div class="gara-content">
        
        <div class="insight-banner card-panel positive">
          <h2 class="section-title">Piano di Gara Generato</h2>
          <p>La strategia ottimale per <strong>{{ durataMinuti }} minuti</strong> a <strong>{{ selectedTrackLabel }}</strong> con <strong>{{ selectedCarLabel }}</strong>.</p>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Giri Stimati</span>
            <span class="stat-value">{{ giriTotali }}</span>
          </div>
          <div class="stat-card highlight">
            <span class="stat-label">Fuel Totale Richiesto</span>
            <span class="stat-value">{{ fuelTotale }} L</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Fuel per Stint</span>
            <span class="stat-value">{{ fuelPerStint }} L</span>
          </div>
        </div>

        <div class="card-panel">
          <h3 class="subsection-title">Stint Plan</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>Stint</th>
                <th>Fase</th>
                <th>Carburante</th>
                <th>Giri (stimati)</th>
                <th>Gomme</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="stint in stintPlan" :key="stint.id">
                <td>#{{ stint.id }}</td>
                <td>{{ stint.type }}</td>
                <td>{{ stint.fuel }} L</td>
                <td>~{{ stint.laps }}</td>
                <td>{{ stint.tires }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card-panel checklist">
          <h3 class="subsection-title">Checklist Pre-Gara</h3>
          <ul>
            <li><input type="checkbox"> Pressioni settate per le temperature previste</li>
            <li><input type="checkbox"> Mappatura motore impostata su Gara</li>
            <li><input type="checkbox"> Brake bias regolato per serbatoio pieno</li>
            <li><input type="checkbox"> Pit stop macro configurata sul volante</li>
          </ul>
        </div>
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
