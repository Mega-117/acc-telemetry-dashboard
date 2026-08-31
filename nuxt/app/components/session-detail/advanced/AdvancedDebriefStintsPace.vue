<script setup lang="ts">
// Bande timeline stint + andamento tempi + degrado/distribuzione (PIP-361, mock statico).
type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'gold'

const stintCards = [
  {
    n: 1,
    intent: 'Apprendimento',
    tyres: 'DHE set1 · età 0',
    fuel: '40→22 L',
    laps: '12 giri (9 puliti)',
    best: '2:19.42',
    sigma: 'σ 0.61',
    trend: [20, 45, 62, 78],
    pressures: [{ v: '27.0' }, { v: '26.9' }, { v: '26.8' }, { v: '26.8' }],
    setupDiff: '—',
    verdict: { text: 'Obiettivo ✅', tone: 'ok' as Tone }
  },
  {
    n: 2,
    intent: 'Baseline setup',
    tyres: 'DHE set1 · età 12',
    fuel: '40→19 L',
    laps: '14 giri (12 puliti)',
    best: '2:18.96',
    sigma: 'σ 0.44',
    trend: [65, 66, 62, 50],
    pressures: [{ v: '27.2' }, { v: '27.0' }, { v: '26.9' }, { v: '26.9' }],
    setupDiff: '—',
    verdict: { text: 'Obiettivo ✅', tone: 'ok' as Tone }
  },
  {
    n: 3,
    intent: 'Test A/B (ARB+ala)',
    tyres: 'DHE set2 · età 0',
    fuel: '40→24 L',
    laps: '11 giri (9 puliti)',
    best: '2:18.71',
    sigma: 'σ 0.48',
    trend: [50, 62, 66, 66],
    pressures: [{ v: '27.3' }, { v: '27.1' }, { v: '26.9' }, { v: '27.0' }],
    setupDiff: 'ARB -1 · ala -1',
    verdict: { text: 'KEEP ✓ (conf. media)', tone: 'gold' as Tone }
  },
  {
    n: 4,
    intent: 'Sim qualifica',
    tyres: 'DHE set2 · età 11',
    fuel: '12→7 L',
    laps: '10 giri (8 puliti)',
    best: '2:18.10 ★',
    sigma: 'σ 0.38',
    trend: [62, 80, 82, 72],
    pressures: [{ v: '27.6', warn: true }, { v: '27.1' }, { v: '26.9' }, { v: '26.8' }],
    setupDiff: '—',
    verdict: { text: 'Obiettivo ✅ PB', tone: 'gold' as Tone }
  }
]

const distributionRows = [
  { label: 'S1', left: 34, width: 46, sigma: '0.61', star: false },
  { label: 'S2', left: 26, width: 34, sigma: '0.44', star: false },
  { label: 'S3', left: 24, width: 36, sigma: '0.48', star: false },
  { label: 'S4', left: 12, width: 28, sigma: '0.38', star: true }
]

const degDots = [
  { x: 24, y: 46 }, { x: 44, y: 58 }, { x: 70, y: 68 }, { x: 102, y: 70 },
  { x: 138, y: 72 }, { x: 176, y: 76 }, { x: 214, y: 82 }, { x: 252, y: 90 },
  { x: 286, y: 99 }
]
</script>

<template>
  <div class="stints-pace-stack">
    <section
      class="band"
      data-testid="adv-stints"
    >
      <h3 class="band-title">
        Timeline stint
      </h3>
      <div class="stint-grid">
        <article
          v-for="stint in stintCards"
          :key="stint.n"
          class="stint-card"
        >
          <header>
            <span class="stint-card-n">Stint {{ stint.n }}</span>
            <span class="stint-card-intent">{{ stint.intent }}</span>
          </header>
          <dl>
            <div>
              <dt>Gomme</dt><dd>{{ stint.tyres }}</dd>
            </div>
            <div>
              <dt>Fuel</dt><dd>{{ stint.fuel }}</dd>
            </div>
            <div>
              <dt>Giri</dt><dd>{{ stint.laps }}</dd>
            </div>
            <div>
              <dt>Best</dt><dd class="mono">
                {{ stint.best }} · {{ stint.sigma }}
              </dd>
            </div>
            <div>
              <dt>Δ setup</dt><dd>{{ stint.setupDiff }}</dd>
            </div>
          </dl>
          <div class="stint-trend">
            <span
              v-for="(bar, i) in stint.trend"
              :key="i"
              class="stint-trend-bar"
              :style="{ height: `${bar}%` }"
            ></span>
          </div>
          <div class="stint-press">
            <span
              v-for="(p, i) in stint.pressures"
              :key="i"
              class="mono"
              :class="{ 'tone-warn': p.warn }"
            >{{ p.v }}</span>
          </div>
          <span
            class="adv-badge"
            :class="`adv-badge--${stint.verdict.tone}`"
          >{{ stint.verdict.text }}</span>
        </article>
      </div>
    </section>

    <section
      class="band"
      data-testid="adv-pace"
    >
      <div class="band-head">
        <h3 class="band-title">
          Andamento tempi
        </h3>
        <span class="adv-chip">raw | <strong>fuel-corrected ✓</strong> · ○ escluso · ★ best</span>
      </div>
      <div class="chart-frame">
        <svg
          viewBox="0 0 640 150"
          role="img"
          aria-label="Andamento demo dei tempi per stint"
        >
          <line
            x1="0"
            y1="118"
            x2="640"
            y2="118"
            class="chart-target"
          />
          <polyline
            class="chart-line chart-line--s1"
            points="16,44 52,64 88,72 124,84 156,90"
          />
          <polyline
            class="chart-line chart-line--s2"
            points="188,86 220,84 252,86 284,92 316,98"
          />
          <polyline
            class="chart-line chart-line--s3"
            points="348,92 380,98 412,102 444,104"
          />
          <polyline
            class="chart-line chart-line--s4"
            points="476,100 508,112 540,120 572,116 608,110"
          />
          <circle
            cx="540"
            cy="120"
            r="5"
            class="chart-best"
          />
          <circle
            cx="252"
            cy="60"
            r="4"
            class="chart-excluded"
          />
        </svg>
        <div class="chart-axis">
          <span>Stint 1 (12)</span><span>Stint 2 (14)</span><span>Stint 3 (11)</span><span>Stint 4 (10)</span>
        </div>
      </div>
    </section>

    <div class="band-pair">
      <section
        class="band"
        data-testid="adv-degradation"
      >
        <h3 class="band-title">
          Degrado gomma
        </h3>
        <div class="chart-frame">
          <svg
            viewBox="0 0 320 130"
            role="img"
            aria-label="Curva demo di degrado"
          >
            <path
              class="deg-band"
              d="M18 66 C90 58, 180 66, 302 92 L302 110 C180 84, 90 74, 18 80 Z"
            />
            <path
              class="deg-fit"
              d="M18 73 C90 66, 180 70, 302 101"
            />
            <circle
              v-for="dot in degDots"
              :key="`${dot.x}-${dot.y}`"
              :cx="dot.x"
              :cy="dot.y"
              r="3"
              class="deg-dot"
            />
            <line
              x1="288"
              y1="20"
              x2="288"
              y2="118"
              class="deg-cliff"
            />
          </svg>
          <div class="chart-axis">
            <span>warm-up</span><span>plateau</span><span>slope +0.041 s/giro ± 0.012</span><span class="tone-warn">cliff &gt;13</span>
          </div>
        </div>
      </section>
      <section
        class="band"
        data-testid="adv-distribution"
      >
        <h3 class="band-title">
          Distribuzione per stint
        </h3>
        <div class="dist-rows">
          <div
            v-for="row in distributionRows"
            :key="row.label"
            class="dist-row"
          >
            <span class="mono">{{ row.label }}</span>
            <div class="dist-track">
              <span
                class="dist-box"
                :style="{ left: `${row.left}%`, width: `${row.width}%` }"
              ></span>
            </div>
            <span class="mono dist-sigma">σ {{ row.sigma }}<template v-if="row.star"> ★</template></span>
          </div>
        </div>
        <p class="band-caption">
          box = P25–P75 · linea = min/max · su giri puliti
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/scss/variables' as *;
@use '@/assets/scss/advanced-debrief-shared' as *;

.stints-pace-stack {
  display: grid;
  gap: 14px;
}

.stint-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 1180px) {
    grid-template-columns: 1fr 1fr;
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
}

.stint-card {
  display: grid;
  gap: 9px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.24);

  header {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: baseline;
  }

  dl {
    margin: 0;
    display: grid;
    gap: 3px;

    div {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }

    dt {
      color: rgba(255, 255, 255, 0.38);
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }

    dd {
      margin: 0;
      color: rgba(255, 255, 255, 0.75);
      font-size: 10px;
      text-align: right;
    }
  }
}

.stint-card-n {
  color: #fff;
  font: 800 12px/1 'Outfit', sans-serif;
}

.stint-card-intent {
  color: $racing-gold;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  text-align: right;
}

.stint-trend {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 26px;
}

.stint-trend-bar {
  flex: 1;
  border-radius: 2px 2px 0 0;
  background: rgba(255, 215, 0, 0.45);
}

.stint-press {
  display: flex;
  justify-content: space-between;
  color: rgba(255, 255, 255, 0.6);
  font-size: 10px;
}

.chart-target {
  stroke: rgba($accent-success, 0.35);
  stroke-dasharray: 5 5;
}

.chart-line {
  fill: none;
  stroke-width: 2.5px;
  stroke-linecap: round;

  &--s1 { stroke: rgba(255, 255, 255, 0.4); }
  &--s2 { stroke: $theme-accent-light; }
  &--s3 { stroke: $accent-info; }
  &--s4 { stroke: $racing-gold; }
}

.chart-best {
  fill: #151520;
  stroke: $racing-gold;
  stroke-width: 3px;
}

.chart-excluded {
  fill: none;
  stroke: rgba(255, 255, 255, 0.3);
  stroke-dasharray: 2 2;
}

.deg-band { fill: rgba(255, 215, 0, 0.07); }
.deg-fit {
  fill: none;
  stroke: $racing-gold;
  stroke-width: 2px;
}
.deg-dot { fill: rgba(255, 255, 255, 0.55); }
.deg-cliff {
  stroke: rgba($accent-danger, 0.5);
  stroke-dasharray: 4 4;
}

.dist-rows {
  display: grid;
  gap: 10px;
}

.dist-row {
  display: grid;
  grid-template-columns: 26px 1fr 70px;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 10px;
}

.dist-track {
  position: relative;
  height: 10px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.06);
}

.dist-box {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 4px;
  background: rgba(255, 215, 0, 0.4);
}

.dist-sigma { text-align: right; }
</style>
