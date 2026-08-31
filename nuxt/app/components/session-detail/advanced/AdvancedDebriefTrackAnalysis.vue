<script setup lang="ts">
// Bande mappa circuito + pannello curva + microsettori + telemetria (PIP-361, mock statico).
type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'gold'

const mapCorners = [
  { id: 'T1', x: 52, y: 118, severity: 'bad' as Tone },
  { id: 'T2', x: 66, y: 84, severity: 'warn' as Tone },
  { id: 'T3', x: 96, y: 44, severity: 'ok' as Tone },
  { id: 'T4', x: 146, y: 32, severity: 'ok' as Tone },
  { id: 'T5', x: 196, y: 40, severity: 'ok' as Tone },
  { id: 'T7', x: 236, y: 66, severity: 'warn' as Tone },
  { id: 'T8', x: 262, y: 96, severity: 'bad' as Tone },
  { id: 'T10', x: 252, y: 132, severity: 'ok' as Tone },
  { id: 'T12', x: 216, y: 152, severity: 'ok' as Tone },
  { id: 'T14', x: 162, y: 150, severity: 'bad' as Tone },
  { id: 'T16', x: 116, y: 156, severity: 'ok' as Tone },
  { id: 'T18', x: 76, y: 146, severity: 'warn' as Tone }
]

const mapLayers = ['Δ tempo', 'v-min', 'Errori', 'Track limits', 'TC/ABS', 'Frenate']

const cornerPhases = [
  { name: 'Frenata', state: 'bad' as Tone, note: '12 m troppo presto' },
  { name: 'v-min', state: 'warn' as Tone, note: '-3 km/h vs rif' },
  { name: 'Rilascio', state: 'ok' as Tone, note: 'ok' },
  { name: 'Gas', state: 'warn' as Tone, note: '+0.2s tardi' },
  { name: 'Linea', state: 'ok' as Tone, note: 'ok' }
]

const microsectors = [
  { n: '01', delta: '+.02', level: 8 },
  { n: '02', delta: '-.01', level: 2 },
  { n: '03', delta: '+.05', level: 16 },
  { n: '04', delta: '+.01', level: 5 },
  { n: '05', delta: '=', level: 3 },
  { n: '06', delta: '+.03', level: 12 },
  { n: '07', delta: '+.09', level: 30 },
  { n: '08', delta: '+.28', level: 100, warn: true },
  { n: '09', delta: '+.04', level: 14 },
  { n: '10', delta: '=', level: 3 },
  { n: '11', delta: '-.02', level: 2 },
  { n: '12', delta: '+.06', level: 20 },
  { n: '13', delta: '+.19', level: 70, warn: true },
  { n: '14', delta: '+.02', level: 8 },
  { n: '15', delta: '+.01', level: 5 },
  { n: '16', delta: '+.04', level: 14 },
  { n: '17', delta: '=', level: 3 },
  { n: '18', delta: '+.02', level: 8 },
  { n: '19', delta: '+.11', level: 40 },
  { n: '20', delta: '+.01', level: 5 }
]
</script>

<template>
  <div class="track-analysis-stack">
    <div class="band-pair band-pair--map">
      <section
        class="band"
        data-testid="adv-track-map"
      >
        <div class="band-head">
          <h3 class="band-title">
            Mappa circuito — heatmap Δ
          </h3>
          <div class="adv-filter-row">
            <span
              v-for="(layer, i) in mapLayers"
              :key="layer"
              class="adv-filter"
              :class="{ 'adv-filter--on': i === 0 }"
            >{{ layer }}</span>
          </div>
        </div>
        <svg
          class="track-map"
          viewBox="0 0 310 180"
          role="img"
          aria-label="Mappa demo del circuito con curve colorate per delta"
        >
          <path
            class="track-path"
            d="M52 118 C40 96, 52 74, 66 62 C82 46, 110 34, 146 32 C182 30, 212 40, 236 58 C258 74, 268 84, 262 100 C256 116, 258 126, 252 132 C242 146, 230 154, 216 152 C196 150, 182 146, 162 150 C142 154, 132 158, 116 156 C96 154, 86 152, 76 146 C62 138, 58 130, 52 118 Z"
          />
          <g
            v-for="corner in mapCorners"
            :key="corner.id"
          >
            <circle
              :cx="corner.x"
              :cy="corner.y"
              r="6"
              class="track-corner"
              :class="`track-corner--${corner.severity}`"
            />
            <text
              :x="corner.x + 9"
              :y="corner.y + 4"
              class="track-label"
            >{{ corner.id }}</text>
          </g>
        </svg>
        <p class="band-caption">
          <span class="tone-ok">●</span> al riferimento ·
          <span class="tone-warn">●</span> -0.05/-0.15s ·
          <span class="tone-bad">●</span> oltre -0.15s · click su una curva per il dettaglio
        </p>
      </section>

      <section
        class="band"
        data-testid="adv-corner-detail"
      >
        <h3 class="band-title">
          Curva: T8 Les Combes
        </h3>
        <p class="corner-kpi mono">
          Δ medio <strong class="tone-bad">+0.28s</strong> · Δ best +0.19s · brake σ <strong class="tone-warn">9 m ⚠</strong>
        </p>
        <ul class="phase-list">
          <li
            v-for="phase in cornerPhases"
            :key="phase.name"
          >
            <span
              class="phase-dot"
              :class="`phase-dot--${phase.state}`"
            ></span>
            <span class="phase-name">{{ phase.name }}</span>
            <span class="phase-note">{{ phase.note }}</span>
          </li>
        </ul>
        <p class="corner-kpi mono">
          v: in 182 · min 121 (rif 124) · marcia 4 · coasting 0.4s · uscita -4 km/h a +200 m
        </p>
        <div class="coach-box">
          <span class="mini-title">Coach — una causa</span>
          <p>«Frena al cartello 100 m e rilascia progressivo.» <strong class="tone-gold">-0.28s</strong></p>
        </div>
        <p class="band-caption">
          Trend negli stint: ▂▄▅▅ — sta migliorando
        </p>
      </section>
    </div>

    <section
      class="band"
      data-testid="adv-microsectors"
    >
      <h3 class="band-title">
        Microsettori (Δ vs riferimento)
      </h3>
      <div class="micro-strip">
        <div
          v-for="ms in microsectors"
          :key="ms.n"
          class="micro-cell"
          :class="{ 'micro-cell--warn': ms.warn }"
        >
          <span
            class="micro-bar"
            :style="{ height: `${Math.max(ms.level, 4)}%` }"
          ></span>
          <span class="micro-delta mono">{{ ms.delta }}</span>
          <span class="micro-n mono">{{ ms.n }}</span>
        </div>
      </div>
    </section>

    <section
      class="band"
      data-testid="adv-telemetry"
    >
      <div class="band-head">
        <h3 class="band-title">
          Confronto telemetria
        </h3>
        <span class="adv-chip">Giro 43 ★ vs <strong>Riferimento</strong> · + aggiungi giro</span>
      </div>
      <div class="tele-rows">
        <div class="tele-row">
          <span class="tele-label">Speed</span>
          <svg
            viewBox="0 0 560 34"
            preserveAspectRatio="none"
          >
            <path
              class="tele-line tele-line--me"
              d="M0 26 C40 8, 70 6, 100 14 S160 30, 200 16 S260 4, 300 10 S360 28, 400 18 S470 6, 560 12"
            />
            <path
              class="tele-line tele-line--ref"
              d="M0 24 C40 7, 70 5, 100 12 S160 28, 200 14 S260 3, 300 8 S360 26, 400 16 S470 5, 560 10"
            />
          </svg>
        </div>
        <div class="tele-row">
          <span class="tele-label">Throttle</span>
          <svg
            viewBox="0 0 560 34"
            preserveAspectRatio="none"
          >
            <path
              class="tele-line tele-line--me"
              d="M0 4 L60 4 L80 30 L120 30 L150 6 L230 4 L250 28 L290 28 L320 6 L420 4 L440 30 L470 30 L500 6 L560 4"
            />
          </svg>
        </div>
        <div class="tele-row">
          <span class="tele-label">Brake</span>
          <svg
            viewBox="0 0 560 34"
            preserveAspectRatio="none"
          >
            <path
              class="tele-line tele-line--brake"
              d="M0 32 L70 32 L84 6 L110 10 L130 32 L240 32 L254 8 L282 14 L300 32 L430 32 L444 8 L468 16 L486 32 L560 32"
            />
          </svg>
        </div>
        <div class="tele-row">
          <span class="tele-label">Δ cumul.</span>
          <svg
            viewBox="0 0 560 34"
            preserveAspectRatio="none"
          >
            <path
              class="tele-line tele-line--delta"
              d="M0 18 L120 17 L200 15 L260 8 L330 9 L400 5 L560 7"
            />
          </svg>
        </div>
      </div>
      <p class="band-caption">
        0 → +0.05 → +0.11 → <strong>T8 +0.33</strong> → +0.29 → <strong>T14 +0.44</strong> → fine +0.262 · cursore sincronizzato con la mappa
      </p>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/scss/variables' as *;
@use '@/assets/scss/advanced-debrief-shared' as *;

.track-analysis-stack {
  display: grid;
  gap: 14px;
}

.track-map {
  display: block;
  width: 100%;
  max-height: 260px;
}

.track-path {
  fill: none;
  stroke: rgba(255, 255, 255, 0.22);
  stroke-width: 7px;
  stroke-linejoin: round;
}

.track-corner {
  stroke-width: 2px;

  &--ok { fill: rgba($accent-success, 0.85); stroke: rgba($accent-success, 0.35); }
  &--warn { fill: rgba($accent-warning, 0.9); stroke: rgba($accent-warning, 0.35); }
  &--bad { fill: rgba($accent-danger, 0.92); stroke: rgba($accent-danger, 0.4); }
}

.track-label {
  fill: rgba(255, 255, 255, 0.55);
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px;
}

.corner-kpi {
  margin: 0 0 10px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 10px;
  line-height: 1.5;
}

.phase-list {
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;

  li {
    display: grid;
    grid-template-columns: 12px 70px 1fr;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  }
}

.phase-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;

  &--ok { background: $accent-success; }
  &--warn { background: $accent-warning; }
  &--bad { background: $accent-danger; }
}

.phase-name {
  color: rgba(255, 255, 255, 0.78);
  font-weight: 650;
}

.phase-note { color: rgba(255, 255, 255, 0.48); }

.micro-strip {
  display: grid;
  grid-template-columns: repeat(20, minmax(0, 1fr));
  gap: 4px;
  align-items: end;

  @media (max-width: 1180px) {
    grid-template-columns: repeat(10, minmax(0, 1fr));
  }
}

.micro-cell {
  display: grid;
  grid-template-rows: 1fr auto auto;
  justify-items: center;
  gap: 3px;
  min-width: 0;
  height: 74px;

  &--warn {
    .micro-bar { background: $accent-danger; }
    .micro-delta { color: $accent-danger-light; }
  }
}

.micro-bar {
  width: 100%;
  max-width: 18px;
  min-height: 2px;
  align-self: end;
  border-radius: 2px 2px 0 0;
  background: rgba(255, 215, 0, 0.5);
}

.micro-delta {
  color: rgba(255, 255, 255, 0.6);
  font-size: 8px;
}

.micro-n {
  color: rgba(255, 255, 255, 0.3);
  font-size: 8px;
}

.tele-rows {
  display: grid;
  gap: 6px;
}

.tele-row {
  display: grid;
  grid-template-columns: 64px 1fr;
  align-items: center;
  gap: 10px;

  svg {
    display: block;
    width: 100%;
    height: 34px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.22);
  }
}

.tele-label {
  color: rgba(255, 255, 255, 0.42);
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.7px;
  text-transform: uppercase;
}

.tele-line {
  fill: none;
  stroke-width: 2px;

  &--me { stroke: $racing-gold; }
  &--ref { stroke: rgba(255, 255, 255, 0.35); stroke-dasharray: 4 3; }
  &--brake { stroke: $accent-danger; }
  &--delta { stroke: $accent-info; }
}
</style>
