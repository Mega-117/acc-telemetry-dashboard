<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SessionDetailLap } from '~/types/sessionDetailViewModel'

type DetailPanelMode = 'standard' | 'advanced'

const props = defineProps<{
  stintNumber?: number | null
  stintType?: string | null
  laps?: SessionDetailLap[]
}>()

const activeMode = ref<DetailPanelMode>('standard')

const normalizedStintType = computed(() => {
  const type = props.stintType?.toUpperCase()
  if (type === 'Q' || type === 'QUALIFY' || type === 'QUALIFYING') return 'Qualifica'
  if (type === 'R' || type === 'RACE') return 'Gara'
  return type || 'Stint'
})

const lapCoverage = computed(() => {
  const laps = props.laps ?? []
  const usable = laps.filter(lap => {
    const valid = lap.valid ?? lap.is_valid ?? false
    const pit = lap.pit ?? lap.has_pit_stop ?? false
    return valid && !pit
  }).length

  return { usable, total: laps.length }
})
</script>

<template>
  <div class="detail-mode-shell">
    <div class="detail-mode-bar">
      <div>
        <span class="detail-mode-eyebrow">Visuale dettaglio</span>
        <p class="detail-mode-context">
          {{ normalizedStintType }}<template v-if="stintNumber">
            · Stint #{{ stintNumber }}
          </template>
        </p>
      </div>

      <div
        class="detail-mode-tabs"
        role="tablist"
        aria-label="Visuale dettaglio sessione"
      >
        <button
          id="session-detail-standard-tab"
          class="detail-mode-tab"
          :class="{ 'detail-mode-tab--active': activeMode === 'standard' }"
          type="button"
          role="tab"
          :aria-selected="activeMode === 'standard'"
          aria-controls="session-detail-standard-panel"
          @click="activeMode = 'standard'"
        >
          Standard
        </button>
        <button
          id="session-detail-advanced-tab"
          class="detail-mode-tab"
          :class="{ 'detail-mode-tab--active': activeMode === 'advanced' }"
          type="button"
          role="tab"
          :aria-selected="activeMode === 'advanced'"
          aria-controls="session-detail-advanced-panel"
          @click="activeMode = 'advanced'"
        >
          Avanzata
          <span
            class="detail-mode-preview-dot"
            aria-hidden="true"
          ></span>
        </button>
      </div>
    </div>

    <div
      v-show="activeMode === 'standard'"
      id="session-detail-standard-panel"
      class="detail-mode-standard"
      role="tabpanel"
      aria-labelledby="session-detail-standard-tab"
    >
      <slot></slot>
    </div>

    <section
      v-if="activeMode === 'advanced'"
      id="session-detail-advanced-panel"
      class="advanced-preview"
      role="tabpanel"
      aria-labelledby="session-detail-advanced-tab"
      data-testid="session-advanced-preview"
    >
      <header class="advanced-preview-header">
        <div>
          <div class="advanced-preview-kicker">
            <span>Analisi avanzata</span>
            <span class="advanced-preview-badge">Anteprima</span>
          </div>
          <h2>
            Lettura dello stint<template v-if="stintNumber">
              #{{ stintNumber }}
            </template>
          </h2>
          <p>Una vista orientata alle decisioni: ritmo, area di lavoro e prossima prova.</p>
        </div>

        <div class="advanced-preview-coverage">
          <span class="coverage-label">Copertura dati</span>
          <strong>{{ lapCoverage.usable }} / {{ lapCoverage.total }}</strong>
          <small>giri utilizzabili</small>
        </div>
      </header>

      <div class="advanced-preview-notice">
        <span
          class="notice-mark"
          aria-hidden="true"
        >i</span>
        <p><strong>Mock esplorativo.</strong> La grafica e i testi sotto sono dimostrativi; non costituiscono ancora un’analisi della guida.</p>
      </div>

      <div class="advanced-preview-grid">
        <article class="advanced-card advanced-card--pace">
          <div class="advanced-card-heading">
            <div>
              <span class="advanced-card-index">Passo</span>
              <h3>Andamento giro per giro</h3>
            </div>
            <span class="advanced-card-state">Esempio visivo</span>
          </div>

          <div
            class="pace-ribbon"
            aria-label="Esempio grafico dell'andamento del passo"
          >
            <div class="pace-target-band"></div>
            <svg
              viewBox="0 0 620 150"
              role="img"
              aria-label="Curva dimostrativa dei tempi sul giro"
            >
              <path
                class="pace-area"
                d="M18 105 C70 82, 102 92, 145 66 S220 53, 268 72 S348 107, 402 70 S494 44, 602 58 L602 134 L18 134 Z"
              />
              <path
                class="pace-line"
                d="M18 105 C70 82, 102 92, 145 66 S220 53, 268 72 S348 107, 402 70 S494 44, 602 58"
              />
              <circle
                cx="18"
                cy="105"
                r="5"
              />
              <circle
                cx="145"
                cy="66"
                r="5"
              />
              <circle
                cx="268"
                cy="72"
                r="5"
              />
              <circle
                cx="402"
                cy="70"
                r="5"
              />
              <circle
                cx="602"
                cy="58"
                r="5"
              />
            </svg>
            <div class="pace-axis">
              <span>INIZIO STINT</span><span>FINE STINT</span>
            </div>
          </div>

          <div class="pace-summary">
            <span class="pace-summary-mark"></span>
            <p><strong>Qui apparirà il trend del passo.</strong> La versione definitiva distinguerà miglioramento, stabilità e calo soltanto quando il campione è confrontabile.</p>
          </div>
        </article>

        <article class="advanced-card advanced-card--sectors">
          <div class="advanced-card-heading">
            <div>
              <span class="advanced-card-index">Settori</span>
              <h3>Dove si concentra il margine</h3>
            </div>
            <span class="advanced-card-state">Valori demo</span>
          </div>

          <div
            class="sector-bars"
            aria-label="Esempio confronto dei tre settori"
          >
            <div class="sector-row">
              <span class="sector-name">S1</span>
              <div class="sector-track">
                <span class="sector-fill sector-fill--one"></span>
              </div>
              <span class="sector-delta">+0.18</span>
            </div>
            <div class="sector-row sector-row--focus">
              <span class="sector-name">S2</span>
              <div class="sector-track">
                <span class="sector-fill sector-fill--two"></span>
              </div>
              <span class="sector-delta">+0.42</span>
            </div>
            <div class="sector-row">
              <span class="sector-name">S3</span>
              <div class="sector-track">
                <span class="sector-fill sector-fill--three"></span>
              </div>
              <span class="sector-delta">+0.11</span>
            </div>
          </div>

          <p class="sector-caption">
            Il settore principale sarà evidenziato solo rispetto a un riferimento dichiarato e con abbastanza giri validi.
          </p>
        </article>

        <article class="advanced-card advanced-card--reading">
          <span class="advanced-card-index">Lettura rapida</span>
          <h3>Un verdetto breve, con la sua evidenza</h3>
          <p>“Ritmo complessivamente stabile. Il margine maggiore si concentra nel settore 2.”</p>
          <span class="advanced-demo-label">Testo dimostrativo</span>
        </article>

        <article class="advanced-card advanced-card--action">
          <div
            class="action-stripe"
            aria-hidden="true"
          ></div>
          <div>
            <span class="advanced-card-index">Prossima cosa da provare</span>
            <h3>Porta un solo obiettivo nella sessione successiva</h3>
            <p>“Cerca due giri consecutivi regolari nel settore 2 prima di aumentare il ritmo.”</p>
          </div>
          <span class="advanced-demo-label">Suggerimento demo</span>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/scss/variables' as *;

.detail-mode-shell { min-width: 0; }

.detail-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin: -4px 0 22px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.detail-mode-eyebrow,
.advanced-card-index,
.coverage-label {
  display: block;
  color: rgba(255, 255, 255, 0.42);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.35px;
  text-transform: uppercase;
}

.detail-mode-context {
  margin: 5px 0 0;
  color: rgba(255, 255, 255, 0.78);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 650;
}

.detail-mode-tabs {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.28);
}

.detail-mode-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 7px 15px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font: 750 10px/1 'Outfit', sans-serif;
  letter-spacing: 0.85px;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease, box-shadow 150ms ease;

  &:hover {
    color: rgba(255, 255, 255, 0.88);
  }

  &:focus-visible {
    outline: 2px solid $racing-gold;
    outline-offset: 2px;
  }

  &--active {
    color: #fff;
    background: rgba(255, 255, 255, 0.09);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }
}

.detail-mode-preview-dot { width: 5px; height: 5px; border-radius: 50%; background: $racing-gold; box-shadow: 0 0 8px rgba(255, 215, 0, 0.52); }

.advanced-preview { color: #f5f7fb; }

.advanced-preview-header {
  display: flex;
  justify-content: space-between;
  gap: 28px;
  padding: 8px 2px 24px;

  h2 {
    margin: 8px 0 5px;
    font: 800 clamp(22px, 3vw, 34px)/1.05 'Outfit', sans-serif;
    letter-spacing: -0.4px;
  }

  p {
    max-width: 580px;
    margin: 0;
    color: rgba(255, 255, 255, 0.52);
    font-size: 12px;
    line-height: 1.55;
  }
}

.advanced-preview-kicker {
  display: flex;
  align-items: center;
  gap: 9px;
  color: $racing-gold;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 1.45px;
  text-transform: uppercase;
}

.advanced-preview-badge,
.advanced-card-state,
.advanced-demo-label {
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

.advanced-preview-coverage {
  min-width: 132px;
  padding: 14px 16px;
  border-left: 2px solid $accent-success;
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.09), transparent);

  strong {
    display: block;
    margin: 4px 0 1px;
    color: #fff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px;
  }

  small {
    color: rgba(255, 255, 255, 0.45);
    font-size: 9px;
  }
}

.advanced-preview-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 215, 0, 0.14);
  border-radius: 7px;
  background: rgba(255, 215, 0, 0.035);

  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.54);
    font-size: 10px;
    line-height: 1.45;
  }

  strong { color: rgba(255, 255, 255, 0.78); }
}

.notice-mark {
  display: grid;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(255, 215, 0, 0.34);
  border-radius: 50%;
  color: $racing-gold;
  font: 800 10px/1 'JetBrains Mono', monospace;
}

.advanced-preview-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(250px, 0.8fr); gap: 14px; }

.advanced-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  background: linear-gradient(145deg, rgba(27, 28, 39, 0.96), rgba(12, 12, 18, 0.96));

  h3 {
    margin: 5px 0 0;
    color: rgba(255, 255, 255, 0.9);
    font: 700 15px/1.25 'Outfit', sans-serif;
  }
}

.advanced-card--pace,
.advanced-card--sectors { padding: 18px; }

.advanced-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }

.pace-ribbon {
  position: relative;
  margin-top: 16px;
  overflow: hidden;
  border-radius: 7px;
  background:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    rgba(0, 0, 0, 0.2);
  background-size: 100% 38px, 72px 100%, auto;

  svg {
    position: relative;
    z-index: 2;
    display: block;
    width: 100%;
    min-height: 142px;
  }

  circle {
    fill: #151520;
    stroke: $racing-gold;
    stroke-width: 3px;
  }
}

.pace-target-band {
  position: absolute;
  z-index: 1;
  top: 55px;
  right: 0;
  left: 0;
  height: 28px;
  border-top: 1px dashed rgba(34, 197, 94, 0.24);
  border-bottom: 1px dashed rgba(34, 197, 94, 0.24);
  background: rgba(34, 197, 94, 0.04);
}

.pace-line { fill: none; stroke: $racing-gold; stroke-linecap: round; stroke-width: 3px; }

.pace-area { fill: rgba(255, 215, 0, 0.08); }

.pace-axis { display: flex; justify-content: space-between; padding: 0 11px 10px; color: rgba(255, 255, 255, 0.28); font-size: 8px; font-weight: 750; letter-spacing: 0.8px; }

.pace-summary {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 13px;

  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.48);
    font-size: 10px;
    line-height: 1.55;
  }

  strong { color: rgba(255, 255, 255, 0.78); }
}

.pace-summary-mark { width: 16px; height: 2px; margin-top: 7px; flex: 0 0 auto; background: $racing-gold; }

.sector-bars { display: grid; gap: 13px; margin-top: 28px; }

.sector-row {
  display: grid;
  grid-template-columns: 26px minmax(100px, 1fr) 46px;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 6px;

  &--focus { background: rgba(255, 215, 0, 0.055); }
}

.sector-name,
.sector-delta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 750;
}

.sector-name { color: rgba(255, 255, 255, 0.62); }
.sector-delta { color: rgba(255, 255, 255, 0.68); text-align: right; }
.sector-row--focus .sector-name,
.sector-row--focus .sector-delta { color: $racing-gold; }

.sector-track { height: 5px; overflow: hidden; border-radius: 4px; background: rgba(255, 255, 255, 0.07); }

.sector-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.4);

  &--one { width: 43%; }
  &--two { width: 86%; background: $racing-gold; }
  &--three { width: 28%; }
}

.sector-caption {
  margin: 24px 2px 0;
  color: rgba(255, 255, 255, 0.38);
  font-size: 9px;
  line-height: 1.55;
}

.advanced-card--reading,
.advanced-card--action {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 13px;
  min-height: 150px;
  padding: 19px;

  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.68);
    font-size: 12px;
    line-height: 1.55;
  }
}

.advanced-card--action {
  display: grid;
  grid-template-columns: 3px 1fr auto;
  align-items: center;
  grid-column: 1 / -1;
  min-height: auto;
  padding: 16px 18px 16px 0;
}

.action-stripe { align-self: stretch; border-radius: 0 3px 3px 0; background: $racing-gold; box-shadow: 0 0 16px rgba(255, 215, 0, 0.18); }

@media (max-width: 1180px) {
  .advanced-preview-grid { grid-template-columns: 1fr; }
  .advanced-card--action { grid-column: auto; }
}

@media (max-width: 720px) {
  .detail-mode-bar,
  .advanced-preview-header {
    align-items: stretch;
    flex-direction: column;
  }

  .detail-mode-tabs { align-self: flex-start; }
  .advanced-preview-coverage { border-left-width: 1px; }

  .advanced-card--action {
    grid-template-columns: 3px 1fr;

    .advanced-demo-label { grid-column: 2; justify-self: start; }
  }
}

@media (prefers-reduced-motion: reduce) {
  .detail-mode-tab { transition: none; }
}
</style>
