<script setup lang="ts">
// Banda contesto + verdetto del debrief allenamento (PIP-361, mock statico).
import { computed } from 'vue'

const props = defineProps<{
  usableLaps?: number
  totalLaps?: number
}>()

const coverage = computed(() => ({
  usable: props.usableLaps ?? 0,
  total: props.totalLaps ?? 0
}))

type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'gold'

const kpis = [
  { label: 'Best lap', value: '2:18.104', sub: '★ PB · ▼ -0.312', tone: 'gold' as Tone },
  { label: 'Passo (mediana puliti)', value: '2:18.937', sub: '▼ -0.41 vs sessione prec.', tone: 'ok' as Tone },
  { label: 'Consistenza', value: 'σ 0.38s', sub: '74% giri entro 0.5s', tone: 'ok' as Tone },
  { label: 'Clean rate', value: '81%', sub: '38 / 47 giri puliti', tone: 'neutral' as Tone },
  { label: 'Theoretical', value: '2:17.611', sub: 'somma best settori', tone: 'neutral' as Tone },
  { label: 'Achievable', value: '2:17.902', sub: '62% in 3 tentativi', tone: 'neutral' as Tone }
]

const readinessBadges = [
  { text: '✅ Ready qualifica', tone: 'ok' as Tone },
  { text: '⚠ Race: serve un long run >15 giri', tone: 'warn' as Tone },
  { text: '🎯 Obiettivo sessione: raggiunto', tone: 'gold' as Tone }
]

const insights = [
  { text: 'T8 Les Combes: freni 12 m troppo presto', gain: '-0.28s' },
  { text: 'T14 Pouhon: 0.4 s di coasting prima del gas', gain: '-0.19s' },
  { text: 'T1 La Source: v-min instabile (σ 4.2 km/h)', gain: '-0.11s' }
]
const sessionRisk = 'Pressione FL 27.6 psi a fine stint (fuori finestra → fredde -0.3)'
</script>

<template>
  <div class="context-stack">
    <header
      class="band adv-context"
      data-testid="adv-context"
    >
      <div class="adv-context-main">
        <div class="adv-context-kicker">
          <span>Debrief allenamento</span>
          <span class="adv-mock-badge">Mock esplorativo</span>
        </div>
        <h2>Spa-Francorchamps · Mercedes-AMG GT3 Evo</h2>
        <p class="adv-context-line">
          92' · 4 stint · <strong>{{ coverage.usable }} / {{ coverage.total }}</strong> giri utilizzabili ·
          Aria 24° · Asfalto 31°→34° · Grip FAST→OPTIMUM · Sereno · Vento 3 km/h
        </p>
      </div>
      <div class="adv-context-side">
        <span class="adv-chip">Riferimento: <strong>Mio best storico · 2:17.842</strong></span>
        <span class="adv-chip">Qualità dati <strong class="tone-ok">ALTA (92%)</strong></span>
        <div class="adv-filter-row">
          <span class="adv-filter adv-filter--on">Puliti</span>
          <span class="adv-filter">Tutti</span>
          <span class="adv-filter">Push</span>
          <span class="adv-filter">Traffico</span>
          <span class="adv-filter">Errori</span>
        </div>
      </div>
    </header>

    <p class="adv-mock-note">
      <strong>Mock esplorativo.</strong> Tutti i numeri sotto sono dimostrativi: servono a definire la vista, non descrivono la tua guida.
    </p>

    <section
      class="band"
      data-testid="adv-verdict"
    >
      <h3 class="band-title">
        Verdetto
      </h3>
      <div class="kpi-grid">
        <div
          v-for="kpi in kpis"
          :key="kpi.label"
          class="kpi"
          :class="`kpi--${kpi.tone}`"
        >
          <span class="kpi-label">{{ kpi.label }}</span>
          <strong class="kpi-value">{{ kpi.value }}</strong>
          <small class="kpi-sub">{{ kpi.sub }}</small>
        </div>
      </div>
      <div class="badge-row">
        <span
          v-for="badge in readinessBadges"
          :key="badge.text"
          class="adv-badge"
          :class="`adv-badge--${badge.tone}`"
        >{{ badge.text }}</span>
      </div>
      <div class="verdict-columns">
        <div>
          <span class="mini-title">Top insight (guadagno stimato)</span>
          <ol class="insight-list">
            <li
              v-for="insight in insights"
              :key="insight.text"
            >
              <span>{{ insight.text }}</span>
              <strong class="tone-gold">{{ insight.gain }}</strong>
            </li>
          </ol>
        </div>
        <div>
          <span class="mini-title">Rischio</span>
          <p class="risk-box">
            ⚠ {{ sessionRisk }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/scss/variables' as *;
@use '@/assets/scss/advanced-debrief-shared' as *;

.context-stack {
  display: grid;
  gap: 14px;
}

.adv-context {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;

  h2 {
    margin: 7px 0 6px;
    font: 800 clamp(20px, 2.6vw, 30px)/1.05 'Outfit', sans-serif;
    letter-spacing: -0.4px;
  }
}

.adv-context-kicker {
  display: flex;
  align-items: center;
  gap: 9px;
  color: $racing-gold;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 1.45px;
  text-transform: uppercase;
}

.adv-context-line {
  margin: 0;
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  line-height: 1.55;

  strong { color: #fff; font-family: 'JetBrains Mono', monospace; }
}

.adv-context-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 7px;

  @media (max-width: 720px) {
    align-items: flex-start;
  }
}

.adv-mock-badge {
  padding: 4px 7px;
  border: 1px solid rgba(255, 215, 0, 0.24);
  border-radius: 4px;
  background: rgba(255, 215, 0, 0.07);
  color: rgba(255, 224, 92, 0.82);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  white-space: nowrap;
}

.adv-mock-note {
  margin: -4px 0 0;
  padding: 9px 12px;
  border: 1px solid rgba(255, 215, 0, 0.14);
  border-radius: 7px;
  background: rgba(255, 215, 0, 0.035);
  color: rgba(255, 255, 255, 0.54);
  font-size: 10px;
  line-height: 1.45;

  strong { color: rgba(255, 255, 255, 0.78); }
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 1180px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr 1fr;
  }
}

.kpi {
  padding: 12px 13px;
  border-left: 2px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.24);

  &--gold { border-left-color: $racing-gold; }
  &--ok { border-left-color: $accent-success; }
}

.kpi-label {
  display: block;
  color: rgba(255, 255, 255, 0.42);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.kpi-value {
  display: block;
  margin: 5px 0 2px;
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 17px;
}

.kpi-sub {
  color: rgba(255, 255, 255, 0.45);
  font-size: 9px;
}

.badge-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.verdict-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 18px;
  margin-top: 14px;

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }
}

.insight-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;

  li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
}
</style>
