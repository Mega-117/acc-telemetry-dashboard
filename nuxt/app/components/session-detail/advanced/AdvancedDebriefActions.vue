<script setup lang="ts">
// Bande errori + piano pilota/ranking + gomme/freni + consumi (PIP-361, mock statico).
const errorRows = [
  { lap: '7', corner: 'T1', type: 'Lockup FL', cost: '0.31s', rec: '4× sistematico', warn: true },
  { lap: '12', corner: 'T14', type: 'Snap oversteer', cost: '0.42s', rec: '2× occasionale', warn: false },
  { lap: '18', corner: 'T19', type: 'Track limit', cost: 'giro ✗', rec: '3× sistematico', warn: true },
  { lap: '31', corner: 'T5', type: 'Apex mancato', cost: '0.18s', rec: '1×', warn: false }
]

const rankingRows = [
  { where: 'T8', cause: 'Brake troppo presto', gain: '-0.28', rec: '9/10', conf: 'alta' },
  { where: 'T14', cause: 'Coasting pre-gas', gain: '-0.19', rec: '8/10', conf: 'alta' },
  { where: 'T1', cause: 'v-min instabile', gain: '-0.11', rec: '6/10', conf: 'media' },
  { where: 'T19', cause: 'Track limit', gain: 'giro ✗', rec: '3/10', conf: 'alta' },
  { where: 'T5', cause: 'Marcia lunga in uscita', gain: '-0.06', rec: '4/10', conf: 'bassa' }
]

const tyreQuadrants = [
  { corner: 'FL', psi: '27.6', warn: true, trendArrow: '▲', core: '87°', window: '61%' },
  { corner: 'FR', psi: '27.1', warn: false, trendArrow: '▬', core: '84°', window: '94%' },
  { corner: 'RL', psi: '26.9', warn: false, trendArrow: '▬', core: '82°', window: '96%' },
  { corner: 'RR', psi: '26.8', warn: false, trendArrow: '▼', core: '81°', window: '97%' }
]
</script>

<template>
  <div class="actions-stack">
    <section
      class="band"
      data-testid="adv-errors"
    >
      <div class="band-head">
        <h3 class="band-title">
          Registro errori
        </h3>
        <span class="adv-chip">14 eventi · costo totale <strong class="tone-bad">3.1s</strong></span>
      </div>
      <table class="adv-table">
        <thead>
          <tr>
            <th>Giro</th><th>Curva</th><th>Tipo</th><th>Costo</th><th>Ricorrenza</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in errorRows"
            :key="`${row.lap}-${row.corner}`"
          >
            <td class="mono">
              {{ row.lap }}
            </td>
            <td class="mono">
              {{ row.corner }}
            </td>
            <td>{{ row.type }}</td>
            <td class="mono tone-bad">
              {{ row.cost }}
            </td>
            <td :class="{ 'tone-warn': row.warn }">
              {{ row.rec }}
            </td>
            <td class="adv-link">
              mappa · telemetria
            </td>
          </tr>
        </tbody>
      </table>
      <p class="band-caption">
        Per curva: T1 ×4 · T19 ×3 · T14 ×2 · altre ×5 — Per fase: gomma fredda 6 ⚠ · fine stint 3 · centro 5 —
        Trend costo: 4.8s → 3.9s → <strong class="tone-ok">3.1s ▼</strong>
      </p>
    </section>

    <div class="band-pair">
      <section
        class="band"
        data-testid="adv-plan"
      >
        <h3 class="band-title">
          Piano pilota
        </h3>
        <dl class="plan-list">
          <div>
            <dt class="tone-ok">
              Mantieni
            </dt><dd>Frenata T5 — sei al riferimento ✅</dd>
          </div>
          <div>
            <dt class="tone-gold">
              Correggi
            </dt><dd>T8: brake point +12 m <strong class="tone-gold">-0.28s</strong></dd>
          </div>
          <div>
            <dt class="tone-warn">
              Monitora
            </dt><dd>Pressione FL a fine stint</dd>
          </div>
          <div>
            <dt>Obiettivo</dt><dd>3 giri &lt; 2:18.6 con T8 pulita</dd>
          </div>
          <div>
            <dt>Drill</dt><dd>5 giri "solo settore 1" · streak ▓▓░░░ 2/5</dd>
          </div>
          <div>
            <dt>Cue</dt><dd>«cartello 100 · rilascio dolce · gas presto»</dd>
          </div>
          <div>
            <dt>Storico</dt><dd>Consiglio precedente (T5): seguito ✅ → -0.21s</dd>
          </div>
        </dl>
      </section>
      <section
        class="band"
        data-testid="adv-ranking"
      >
        <h3 class="band-title">
          Ranking perdite (ingegnere)
        </h3>
        <table class="adv-table">
          <thead>
            <tr>
              <th>#</th><th>Dove</th><th>Causa</th><th>Recupero</th><th>Ricorr.</th><th>Conf.</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in rankingRows"
              :key="row.where + row.cause"
            >
              <td class="mono">
                {{ i + 1 }}
              </td>
              <td class="mono">
                {{ row.where }}
              </td>
              <td>{{ row.cause }}</td>
              <td class="mono tone-gold">
                {{ row.gain }}
              </td>
              <td class="mono">
                {{ row.rec }}
              </td>
              <td>{{ row.conf }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <div class="band-pair">
      <section
        class="band"
        data-testid="adv-tyres"
      >
        <h3 class="band-title">
          Gomme (stint 4)
        </h3>
        <div class="tyre-grid">
          <div
            v-for="tyre in tyreQuadrants"
            :key="tyre.corner"
            class="tyre-cell"
            :class="{ 'tyre-cell--warn': tyre.warn }"
          >
            <span class="tyre-corner">{{ tyre.corner }}</span>
            <strong class="mono">{{ tyre.psi }} psi {{ tyre.trendArrow }}</strong>
            <small>core {{ tyre.core }} · in finestra {{ tyre.window }}</small>
          </div>
        </div>
        <p class="band-caption">
          Warm-up: 2.5 giri per entrare in finestra · asimmetria ant/post +0.4
        </p>
        <div class="coach-box">
          <span class="mini-title">Consiglio fredde (asfalto atteso 34°)</span>
          <p class="mono">
            FL 22.1 (−0.3) · FR 22.4 · RL 22.3 · RR 22.4
          </p>
        </div>
      </section>
      <section
        class="band"
        data-testid="adv-brakes"
      >
        <h3 class="band-title">
          Freni
        </h3>
        <dl class="plan-list">
          <div>
            <dt>Anteriore</dt><dd class="mono">
              avg 512° · peak 641° <span class="tone-ok">✓</span>
            </dd>
          </div>
          <div>
            <dt>Posteriore</dt><dd class="mono">
              avg 388° · peak 462° <span class="tone-warn">⚠</span>
            </dd>
          </div>
          <div>
            <dt>In finestra</dt><dd class="mono">
              88% del tempo
            </dd>
          </div>
          <div>
            <dt>Lockup</dt><dd class="mono">
              T1 ×4 · T8 ×1
            </dd>
          </div>
          <div>
            <dt>Bias</dt><dd class="mono">
              57.2% (−0.4 nello stint 3)
            </dd>
          </div>
          <div>
            <dt>Pad</dt><dd>proiezione OK (&gt;6h)</dd>
          </div>
        </dl>
      </section>
    </div>

    <section
      class="band"
      data-testid="adv-fuel"
    >
      <h3 class="band-title">
        Consumi
      </h3>
      <p class="fuel-line mono">
        2.94 L/giro (min 2.81 · max 3.02 · trend ▬) · autonomia 120 L = 40 giri ≈ 93' ·
        push 2.98 vs save 2.71 (−9%, +0.8 s/giro) · calcolatore: 20 min → 19.6 L (+1 giro margine)
      </p>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/scss/variables' as *;
@use '@/assets/scss/advanced-debrief-shared' as *;

.actions-stack {
  display: grid;
  gap: 14px;
}

.tyre-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.tyre-cell {
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.24);

  strong {
    color: #fff;
    font-size: 12px;
  }

  small {
    color: rgba(255, 255, 255, 0.45);
    font-size: 9px;
  }

  &--warn {
    border-color: rgba($accent-warning, 0.45);

    strong { color: $accent-warning; }
  }
}

.tyre-corner {
  color: rgba(255, 255, 255, 0.42);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1px;
}
</style>
