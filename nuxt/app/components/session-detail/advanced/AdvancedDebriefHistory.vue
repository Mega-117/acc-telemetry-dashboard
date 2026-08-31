<script setup lang="ts">
// Bande progressione/skill map + ledger setup + tabella giri + debrief pilota + team (PIP-361, mock statico).
const progressionRows = [
  { label: 'Best', from: '2:19.41', to: '2:18.10', trend: [90, 76, 74, 58, 40, 22] },
  { label: 'Media pulita', from: '2:20.2', to: '2:18.9', trend: [92, 88, 74, 58, 44, 40] },
  { label: 'σ', from: '0.71', to: '0.38', trend: [88, 74, 60, 58, 42, 26] },
  { label: 'Errori/giro', from: '0.61', to: '0.30', trend: [86, 72, 66, 50, 40, 30] }
]

const skillColumns = ['S-5', 'S-4', 'S-3', 'S-2', 'S-1', 'Oggi']

const skillRows = [
  { corner: 'T1', cells: [1, 1, 2, 2, 2, 2], note: 'ferma ⚠' },
  { corner: 'T5', cells: [2, 2, 3, 3, 4, 4], note: '✅' },
  { corner: 'T8', cells: [1, 1, 1, 2, 2, 2], note: 'lenta' },
  { corner: 'T14', cells: [1, 2, 2, 2, 2, 2], note: 'ferma ⚠' }
]

const lapTableRows = [
  { n: '43', time: '2:18.104', s1: '40.211', s2: '57.882', s3: '40.011', delta: '—', fuel: '10L', age: '9', badge: 'PUSH ★PB', gold: true },
  { n: '44', time: '2:18.395', s1: '40.302', s2: '57.995', s3: '40.098', delta: '+0.291', fuel: '7L', age: '10', badge: 'PUSH', gold: false },
  { n: '18', time: '2:19.877 ✗', s1: '40.480', s2: '58.700', s3: '40.697', delta: '+1.773', fuel: '31L', age: '5', badge: 'PUSH · TRACK LIMIT T19', gold: false }
]
</script>

<template>
  <div class="history-stack">
    <div class="band-pair">
      <section
        class="band"
        data-testid="adv-progression"
      >
        <h3 class="band-title">
          Progressione — ultime 6 sessioni
        </h3>
        <div class="prog-rows">
          <div
            v-for="row in progressionRows"
            :key="row.label"
            class="prog-row"
          >
            <span class="prog-label">{{ row.label }}</span>
            <span class="mono">{{ row.from }} → <strong>{{ row.to }}</strong></span>
            <span class="prog-spark">
              <span
                v-for="(bar, i) in row.trend"
                :key="i"
                class="prog-bar"
                :style="{ height: `${bar}%` }"
              ></span>
            </span>
          </div>
        </div>
        <p class="band-caption">
          vs ultima sessione: asfalto +6° (differenza dichiarata nel confronto)
        </p>
      </section>
      <section
        class="band"
        data-testid="adv-skillmap"
      >
        <h3 class="band-title">
          Skill map — curve × sessioni
        </h3>
        <div class="skill-grid">
          <div class="skill-row skill-row--head">
            <span></span>
            <span
              v-for="col in skillColumns"
              :key="col"
              class="mono"
            >{{ col }}</span>
            <span></span>
          </div>
          <div
            v-for="row in skillRows"
            :key="row.corner"
            class="skill-row"
          >
            <span class="mono">{{ row.corner }}</span>
            <span
              v-for="(cell, i) in row.cells"
              :key="i"
              class="skill-cell"
              :class="`skill-cell--${cell}`"
            ></span>
            <span class="skill-note">{{ row.note }}</span>
          </div>
        </div>
        <p class="band-caption">
          scuro = critico · oro = al riferimento
        </p>
      </section>
    </div>

    <section
      class="band"
      data-testid="adv-setup-ledger"
    >
      <h3 class="band-title">
        Ledger test setup — stint 3 vs stint 2
      </h3>
      <p class="fuel-line">
        Δ setup: <span class="mono">ARB post 4→3 · ala 6→5</span> · Ipotesi: più rotazione in ingresso lente ·
        Effetti: passo <strong class="tone-ok">−0.18s ✓</strong> · σ +0.04 ≈ · press RL <span class="tone-warn">+0.2 ⚠</span> ·
        curve T14 ✓ T1 ✓ T5 ✗ · Pilota: «più girata, meno stabile sui cordoli» → coerente ·
        Verdetto <strong class="tone-gold">KEEP</strong> (conf. media, retest con asfalto &gt;35°)
      </p>
    </section>

    <section
      class="band"
      data-testid="adv-lap-table"
    >
      <div class="band-head">
        <h3 class="band-title">
          Tabella giri completa (47)
        </h3>
        <span class="adv-chip">espandi ▾</span>
      </div>
      <table class="adv-table">
        <thead>
          <tr>
            <th>#</th><th>Tempo</th><th>S1</th><th>S2</th><th>S3</th><th>Δ best</th><th>Fuel</th><th>Età</th><th>Badge</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in lapTableRows"
            :key="row.n"
            :class="{ 'row-gold': row.gold }"
          >
            <td class="mono">
              {{ row.n }}
            </td>
            <td class="mono">
              {{ row.time }}
            </td>
            <td class="mono">
              {{ row.s1 }}
            </td>
            <td class="mono">
              {{ row.s2 }}
            </td>
            <td class="mono">
              {{ row.s3 }}
            </td>
            <td class="mono">
              {{ row.delta }}
            </td>
            <td class="mono">
              {{ row.fuel }}
            </td>
            <td class="mono">
              {{ row.age }}
            </td>
            <td>{{ row.badge }}</td>
          </tr>
        </tbody>
      </table>
      <p class="band-caption">
        footer: theoretical 2:17.611 · achievable 2:17.902 · best di settore evidenziati
      </p>
    </section>

    <section
      class="band"
      data-testid="adv-driver-debrief"
    >
      <h3 class="band-title">
        Debrief pilota (post stint 4)
      </h3>
      <p class="fuel-line">
        Bilancio: ingresso 3/5 sovra · centro 2/5 sotto (lente) · uscita 4/5 ok — Frenata 4/5 · Trazione 3/5 ·
        Cordoli <span class="tone-warn">2/5 ⚠</span> · Fiducia bassa: T8–T9 · Drop gomma percepito: giro 9 ·
        🎤 nota vocale 0:42 ▶
      </p>
      <p class="risk-box">
        Divergenza: «gomme finite» ma degrado misurato 0.04 s/giro → è esecuzione, non gomma ⚠
      </p>
    </section>

    <section
      class="band"
      data-testid="adv-team"
    >
      <h3 class="band-title">
        Team
      </h3>
      <p class="fuel-line">
        Confronto: <strong>TU</strong> 2:18.10 σ0.38 · <strong>Teammate</strong> 2:17.93 σ0.51 · Δ per curva [apri] ·
        deg: tu −0.041 lui −0.055 — 💬 3 commenti ingegnere su stint 3 ·
        condividi stint card · esporta CSV/MoTeC · invia a Pit Wall
      </p>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/scss/variables' as *;
@use '@/assets/scss/advanced-debrief-shared' as *;

.history-stack {
  display: grid;
  gap: 14px;
}

.prog-rows {
  display: grid;
  gap: 9px;
}

.prog-row {
  display: grid;
  grid-template-columns: 84px 1fr 90px;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.68);
}

.prog-label {
  color: rgba(255, 255, 255, 0.42);
  font-size: 9px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.7px;
}

.prog-spark {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 20px;
}

.prog-bar {
  flex: 1;
  border-radius: 1px 1px 0 0;
  background: rgba(255, 215, 0, 0.45);
}

.skill-grid {
  display: grid;
  gap: 5px;
}

.skill-row {
  display: grid;
  grid-template-columns: 36px repeat(6, 22px) 1fr;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);

  &--head {
    color: rgba(255, 255, 255, 0.35);
    font-size: 8px;
  }
}

.skill-cell {
  height: 16px;
  border-radius: 3px;

  &--1 { background: rgba($accent-danger, 0.55); }
  &--2 { background: rgba($accent-warning, 0.4); }
  &--3 { background: rgba(255, 215, 0, 0.35); }
  &--4 { background: rgba(255, 215, 0, 0.75); }
}

.skill-note {
  color: rgba(255, 255, 255, 0.42);
  font-size: 9px;
}
</style>
