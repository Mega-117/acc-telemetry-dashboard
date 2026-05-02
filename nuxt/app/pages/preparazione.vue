<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { CoachBriefingScenario } from '~/composables/useCoachInsights'

definePageMeta({
  layout: 'dashboard'
})

type PrepTone = 'baseline' | 'pace' | 'race' | 'clean' | 'success'

interface PrepScenario {
  id: CoachBriefingScenario
  label: string
  tone: PrepTone
  title: string
  subtitle: string
  objective: string
  sessionType: string
  fuelHint: string
  warmupLabel: string
  workLabel: string
  focus: string
  target: string
  doRules: string[]
  avoidRules: string[]
  completionRules: string[]
}

const route = useRoute()

const scenarioOrder: CoachBriefingScenario[] = [
  'no_recent_activity',
  'qualify_to_race',
  'clean_laps_focus',
  'race_volume_low',
  'completed_next_step'
]

const scenarios: Record<CoachBriefingScenario, PrepScenario> = {
  no_recent_activity: {
    id: 'no_recent_activity',
    label: 'Pulizia',
    tone: 'baseline',
    title: 'Sessione Pulizia',
    subtitle: 'Prima di parlare di passo o best devi tenere la macchina in pista.',
    objective: 'Dopo il warm-up fai 30 minuti di lavoro pulizia. Guida sotto al limite: oggi conta solo chiudere giri validi.',
    sessionType: 'Prova libera',
    fuelHint: 'Medio e stabile',
    warmupLabel: '10 min warm-up',
    workLabel: '30 min pulizia',
    focus: 'Giri validi',
    target: '85% giri validi',
    doRules: [
      'Guida sotto al limite, con margine sui punti dove invalidi spesso.',
      'Usa riferimenti semplici in frenata e uscita curva.',
      'Tieni la macchina in pista: il tempo oggi non conta.'
    ],
    avoidRules: [
      'Hotlap e cordoli rischiosi.',
      'Cambiare setup o fuel durante la run.',
      'Compensare un errore spingendo ancora di piu nel giro dopo.'
    ],
    completionRules: [
      'Almeno 85% dei giri validi',
      'Nessuna ricerca del limite negli ultimi giri',
      'Dati puliti per passare a costanza o qualifica'
    ]
  },
  qualify_to_race: {
    id: 'qualify_to_race',
    label: 'Costanza',
    tone: 'pace',
    title: 'Sessione Costanza',
    subtitle: 'Il giro veloce serve poco se non riesci a ripeterlo.',
    objective: 'Nel lavoro vero fai 2 blocchi da 15 minuti. Crea un riferimento valido e resta vicino a quel ritmo, senza trasformarlo in qualifica.',
    sessionType: 'Prova libera',
    fuelHint: 'Medio e stabile',
    warmupLabel: '10 min warm-up',
    workLabel: '2 blocchi da 15 min',
    focus: 'Delta dal best blocco',
    target: '8 giri entro +0.8',
    doRules: [
      'Crea un best valido del blocco e usalo come riferimento.',
      'Ripeti il giro buono senza cercare ogni volta il limite.',
      'Mantieni fuel e setup identici tra i blocchi.'
    ],
    avoidRules: [
      'Trasformare la run in una qualifica lunga.',
      'Valutare solo il giro piu veloce.',
      'Cambiare ritmo dopo ogni piccolo errore.'
    ],
    completionRules: [
      'Almeno 8 giri validi nel delta',
      'Niente cambio setup tra i blocchi',
      'Best e media leggibili nello stesso lavoro'
    ]
  },
  race_volume_low: {
    id: 'race_volume_low',
    label: 'Long run',
    tone: 'race',
    title: 'Sessione Long run',
    subtitle: 'Qui alleni gara vera: ritmo, validita, gestione e lucidita fino alla fine.',
    objective: 'Nel lavoro vero fai 30 minuti continui. Conta portare ritmo e validita fino alla fine, non il singolo giro.',
    sessionType: 'Prova libera o gara',
    fuelHint: 'Mezzo serbatoio o pieno',
    warmupLabel: '10 min warm-up',
    workLabel: '30 min stint continuo',
    focus: 'Tenuta passo',
    target: '90% validi + passo entro +1.0',
    doRules: [
      'Guida uno stint continuo senza fermarti.',
      'Porta ritmo e validita fino agli ultimi giri.',
      'Usa fuel medio/alto e setup stabile.'
    ],
    avoidRules: [
      'Cercare un settore veloce sacrificando il giro dopo.',
      'Fermarti per correggere setup durante il lavoro.',
      'Ignorare il calo finale: e parte dell esercizio.'
    ],
    completionRules: [
      'Almeno 90% giri validi',
      'Passo medio entro +1.0 dal best stint',
      'Ultimi giri senza crollo enorme'
    ]
  },
  clean_laps_focus: {
    id: 'clean_laps_focus',
    label: 'Qualifica',
    tone: 'clean',
    title: 'Sessione Qualifica',
    subtitle: 'Allena pressione e giro secco: pochi tentativi, niente mezzora per trovare il tempo.',
    objective: 'Nel lavoro vero fai 3 run brevi: outlap e 2-3 giri push. Devi tirare fuori un giro valido forte in pochi tentativi.',
    sessionType: 'Qualifica',
    fuelHint: 'Massimo 20 L',
    warmupLabel: '10 min warm-up',
    workLabel: '3 run da 10 min',
    focus: 'Giro competitivo',
    target: '1 giro forte per run',
    doRules: [
      'Ogni run: outlap e pochi giri push.',
      'Crea un riferimento e prova a replicarlo subito.',
      'Accetta pochi tentativi: qui conta performare su richiesta.'
    ],
    avoidRules: [
      'Girare mezzora finche arriva il giro buono.',
      'Invalidare run intere per cercare troppo cordolo.',
      'Cambiare setup tra una run e l altra.'
    ],
    completionRules: [
      'Almeno 1 giro valido competitivo per run',
      'Pochi tentativi buttati via',
      'Riferimento chiaro tra run 1, 2 e 3'
    ]
  },
  completed_next_step: {
    id: 'completed_next_step',
    label: 'Traffico',
    tone: 'success',
    title: 'Sessione Traiettorie / traffico',
    subtitle: 'Se sai guidare solo sulla traiettoria ideale, sai fare hotlap ma non sai ancora correre.',
    objective: 'Nel lavoro vero fai tre gare brevi o tre blocchi trafficati. Parti in mezzo al gruppo e chiudi pulito, anche riducendo il ritmo.',
    sessionType: 'Gara AI o multiplayer',
    fuelHint: 'Medio / gara breve',
    warmupLabel: '10 min warm-up',
    workLabel: '3 gare brevi',
    focus: 'Adattamento',
    target: 'Pulito fuori linea',
    doRules: [
      'Prova linee diverse dalla traiettoria ideale.',
      'Riduci il ritmo se serve per restare pulito.',
      'Chiudi il blocco senza ritiro e senza caos.'
    ],
    avoidRules: [
      'Guidare come se fossi sempre in hotlap.',
      'Forzare sorpassi o difese senza margine.',
      'Valutare solo il tempo: qui conta adattarsi.'
    ],
    completionRules: [
      'Blocchi completati senza ritiro',
      'Pochi invalidi',
      'Ritmo non oltre +2.0/+3.0 dal normale'
    ]
  }
}

const isScenario = (value: unknown): value is CoachBriefingScenario => {
  return typeof value === 'string' && scenarioOrder.includes(value as CoachBriefingScenario)
}

const initialScenario = computed<CoachBriefingScenario>(() => {
  const raw = route.query.scenario
  return isScenario(raw) ? raw : 'race_volume_low'
})

const selectedScenario = ref<CoachBriefingScenario>(initialScenario.value)

watch(initialScenario, (scenario) => {
  selectedScenario.value = scenario
})

const selectedPlan = computed(() => scenarios[selectedScenario.value])
const toneClass = computed(() => `tone-${selectedPlan.value.tone}`)
const showDevPreview = import.meta.dev

const scenarioOptions = computed(() => scenarioOrder.map((id) => ({
  id,
  label: scenarios[id].label
})))
</script>

<template>
  <LayoutPageContainer>
    <div class="prep-page" :class="toneClass">
      <header class="prep-hero">
        <div class="prep-hero__copy">
          <span class="eyebrow">Preparazione obiettivo</span>
          <h1>{{ selectedPlan.title }}</h1>
          <p>{{ selectedPlan.subtitle }}</p>
        </div>

      </header>

      <section v-if="showDevPreview" class="scenario-switch">
        <span>Preview scenario</span>
        <select v-model="selectedScenario">
          <option v-for="scenario in scenarioOptions" :key="scenario.id" :value="scenario.id">
            {{ scenario.label }}
          </option>
        </select>
      </section>

      <section class="prep-layout">
        <article class="prep-card prep-card--primary objective-card">
          <div class="objective-topline">
            <span class="eyebrow">Obiettivo pilota</span>
          </div>
          <h2>{{ selectedPlan.target }}</h2>
          <p>{{ selectedPlan.objective }}</p>

          <div class="session-flow" aria-label="Struttura sessione">
            <div class="flow-step flow-step--warmup">
              <span>Warm-up</span>
              <strong>{{ selectedPlan.warmupLabel }}</strong>
            </div>
            <div class="flow-arrow">-&gt;</div>
            <div class="flow-step flow-step--work">
              <span>Lavoro vero</span>
              <strong>{{ selectedPlan.workLabel }}</strong>
            </div>
          </div>

          <div class="metric-row metric-row--compact">
            <div>
              <span>Modalita ACC</span>
              <strong>{{ selectedPlan.sessionType }}</strong>
            </div>
            <div>
              <span>Obiettivo</span>
              <strong>{{ selectedPlan.target }}</strong>
            </div>
            <div>
              <span>Focus</span>
              <strong>{{ selectedPlan.focus }}</strong>
            </div>
            <div>
              <span>Carburante</span>
              <strong>{{ selectedPlan.fuelHint }}</strong>
            </div>
          </div>
        </article>

        <aside class="side-column">
          <article class="prep-card compact-card">
            <span class="eyebrow">Fai questo</span>
            <ul class="plain-list">
              <li v-for="rule in selectedPlan.doRules" :key="rule">
                {{ rule }}
              </li>
            </ul>
          </article>

          <article class="prep-card compact-card">
            <span class="eyebrow">Evita questo</span>
            <ul class="plain-list plain-list--avoid">
              <li v-for="rule in selectedPlan.avoidRules" :key="rule">
                {{ rule }}
              </li>
            </ul>
          </article>

        </aside>
      </section>
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
.prep-page {
  --accent-rgb: 255, 59, 34;
  --accent: #ff3b22;
  --accent-end: #ff8a00;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.prep-page.tone-baseline {
  --accent-rgb: 40, 183, 255;
  --accent: #28b7ff;
  --accent-end: #4fd1c5;
}

.prep-page.tone-pace {
  --accent-rgb: 255, 142, 41;
  --accent: #ff8e29;
  --accent-end: #ffbf3f;
}

.prep-page.tone-race {
  --accent-rgb: 255, 59, 34;
  --accent: #ff3b22;
  --accent-end: #ff8a00;
}

.prep-page.tone-clean {
  --accent-rgb: 255, 205, 64;
  --accent: #ffcd40;
  --accent-end: #ff9f1c;
}

.prep-page.tone-success {
  --accent-rgb: 34, 197, 94;
  --accent: #22c55e;
  --accent-end: #14b8a6;
}

.prep-hero,
.prep-card,
.scenario-switch {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    radial-gradient(circle at top left, rgba(var(--accent-rgb), 0.13), transparent 36%),
    linear-gradient(145deg, rgba(26, 26, 36, 0.98), rgba(12, 12, 18, 0.98));
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.22);
}

.prep-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 22px;
  padding: 30px;
  border-radius: 22px;
}

.prep-hero h1,
.prep-card h2 {
  margin: 0;
  color: var(--text-primary);
  font-weight: 800;
}

.prep-hero h1 {
  max-width: 780px;
  font-size: clamp(32px, 4.5vw, 52px);
  line-height: 1;
}

.prep-hero p,
.prep-card p {
  margin: 14px 0 0 0;
  color: var(--text-secondary);
  line-height: 1.55;
}

.prep-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.scenario-switch,
.eyebrow,
.scenario-switch span,
.metric-row span {
  display: block;
  color: rgba(255, 255, 255, 0.46);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.scenario-switch {
  display: flex;
  align-items: center;
  gap: 14px;
  width: fit-content;
  padding: 10px 12px;
}

.scenario-switch select {
  min-width: 220px;
  padding: 8px 11px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-weight: 800;
}

.scenario-switch option {
  color: #111;
}

.prep-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(320px, 0.88fr);
  gap: 24px;
  align-items: start;
}

.prep-card {
  padding: 24px;
  border-radius: 18px;
}

.prep-card--primary {
  border-color: rgba(var(--accent-rgb), 0.28);
}

.objective-card {
  min-height: 430px;
}

.objective-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}

.objective-card h2 {
  max-width: 720px;
  font-size: clamp(34px, 5vw, 64px);
  line-height: 0.95;
}

.objective-card p {
  max-width: 620px;
  font-size: 18px;
}

.session-flow {
  display: flex;
  align-items: center;
  justify-content: stretch;
  gap: 14px;
  margin-top: 28px;
  padding: 14px;
  border-radius: 16px;
  background:
    linear-gradient(90deg, rgba(var(--accent-rgb), 0.16), rgba(255, 255, 255, 0.045));
  border: 1px solid rgba(var(--accent-rgb), 0.24);
}

.flow-step {
  flex: 1;
  min-width: 0;
  min-height: 96px;
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
}

.flow-step--work {
  background: rgba(var(--accent-rgb), 0.14);
  border-color: rgba(var(--accent-rgb), 0.28);
}

.flow-step span {
  display: block;
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.flow-step strong {
  display: block;
  margin-top: 10px;
  color: #fff;
  font-size: clamp(17px, 1.7vw, 23px);
  font-weight: 900;
  line-height: 1.15;
}

.flow-arrow {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  color: #111;
  background: linear-gradient(135deg, var(--accent), var(--accent-end));
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(var(--accent-rgb), 0.18);
}

.metric-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;
}

.metric-row--compact {
  margin-top: 16px;
}

.metric-row > div {
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.metric-row strong {
  display: block;
  margin-top: 7px;
  color: #fff;
  font-size: 15px;
}

.side-column {
  display: grid;
  gap: 18px;
}

.compact-card {
  padding: 22px;
}

.plain-list,
.check-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 18px 0 0 0;
  list-style: none;
}

.plain-list li,
.check-list li {
  position: relative;
  padding-left: 26px;
  color: var(--text-secondary);
  line-height: 1.45;
}

.plain-list li::before,
.check-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.45em;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 18px rgba(var(--accent-rgb), 0.45);
}

.plain-list--avoid li::before {
  background: #ff5a4f;
  box-shadow: 0 0 18px rgba(255, 90, 79, 0.38);
}

.plain-list strong {
  color: #fff;
}

.tracking-note {
  display: grid;
  gap: 6px;
  margin-top: 22px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(var(--accent-rgb), 0.09);
  border: 1px dashed rgba(var(--accent-rgb), 0.32);
}

.tracking-note strong {
  color: #fff;
}

.tracking-note span {
  color: var(--text-secondary);
  line-height: 1.45;
}

@media (max-width: 900px) {
  .prep-hero,
  .prep-layout {
    grid-template-columns: 1fr;
  }

  .objective-topline,
  .session-flow {
    align-items: stretch;
    flex-direction: column;
  }

  .flow-arrow {
    transform: rotate(90deg);
    align-self: center;
  }

  .metric-row {
    grid-template-columns: 1fr;
  }

  .scenario-switch {
    width: 100%;
    align-items: stretch;
    flex-direction: column;
    border-radius: 16px;
  }

  .scenario-switch select {
    width: 100%;
  }
}
</style>

