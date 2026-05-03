<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

definePageMeta({
  layout: 'dashboard'
})

type PrepTone = 'baseline' | 'pace' | 'race' | 'clean' | 'success'
type TrainingId = 'tracktitan_input' | 'clean_laps' | 'qualifying' | 'consistency' | 'race_real'
type DurationId = '20' | '30' | '40' | '60'

interface TimelineStep {
  label: string
  duration: string
  detail: string
}

interface DurationPlan {
  id: DurationId
  label: string
  totalLabel: string
  timeline: TimelineStep[]
}

interface TrainingPlan {
  id: TrainingId
  label: string
  tone: PrepTone
  title: string
  intro: string
  sessionType: string
  fuelHint: string
  targetHint: string
  referenceHint: string
  focus: string
  target: string
  objective: string
  durations: DurationPlan[]
  goals: string[]
  doRules: string[]
  avoidRules: string[]
}

const route = useRoute()

const trainingOrder: TrainingId[] = [
  'tracktitan_input',
  'clean_laps',
  'qualifying',
  'consistency',
  'race_real'
]

const legacyScenarioMap: Record<string, TrainingId> = {
  no_recent_activity: 'clean_laps',
  qualify_to_race: 'consistency',
  clean_laps_focus: 'qualifying',
  race_volume_low: 'race_real',
  completed_next_step: 'race_real'
}

const trainingPlans: Record<TrainingId, TrainingPlan> = {
  tracktitan_input: {
    id: 'tracktitan_input',
    label: 'TrackTitan',
    tone: 'success',
    title: 'TrackTitan Input Match',
    intro: 'Correggi freno e gas nei segmenti dove sei diverso dal riferimento. Non inseguire il delta: sistema gli input.',
    sessionType: 'Prova libera',
    fuelHint: 'Stabile, come il riferimento',
    targetHint: '2 segmenti corretti',
    referenceHint: 'Coach o giro confronto',
    focus: 'Brake / throttle',
    target: '2 segmenti corretti',
    objective: 'Confronta pochi segmenti, correggi gli input e torna subito in pista per renderli ripetibili.',
    durations: [
      {
        id: '30',
        label: '30 min',
        totalLabel: '30 min totali',
        timeline: [
          { label: 'Guida', duration: '10 min', detail: 'Gira pulito e salva un riferimento recente.' },
          { label: 'TrackTitan', duration: '6 min', detail: 'Scegli 1-2 segmenti con input molto diversi.' },
          { label: 'Run mirata', duration: '10 min', detail: 'Ripeti quei punti con brake e throttle corretti.' },
          { label: 'Note', duration: '4 min', detail: 'Segna cosa cambia e cosa resta da correggere.' }
        ]
      },
      {
        id: '60',
        label: '60 min',
        totalLabel: '60 min totali',
        timeline: [
          { label: 'Guida', duration: '10 min', detail: 'Crea il riferimento della sessione.' },
          { label: 'TrackTitan', duration: '8 min', detail: 'Scegli pochi segmenti, non tutto il giro.' },
          { label: 'Run mirata', duration: '17 min', detail: 'Lavora sul primo blocco di correzioni.' },
          { label: 'Run conferma', duration: '20 min', detail: 'Ripeti senza forzare il tempo.' },
          { label: 'Note', duration: '5 min', detail: 'Scrivi i segmenti da tenere nel prossimo lavoro.' }
        ]
      }
    ],
    goals: [
      'Scegli 1-2 segmenti con input molto diversi.',
      'Rendi freno e gas piu simili al riferimento.',
      'Verifica se il segmento diventa piu pulito.'
    ],
    doRules: [
      'Guarda soprattutto freno e acceleratore.',
      'Lavora su pochi segmenti.',
      'Torna subito in pista dopo il confronto.'
    ],
    avoidRules: [
      'Inseguire solo il delta.',
      'Cambiare troppi punti insieme.',
      'Trasformare il lavoro in hotlap.'
    ]
  },
  clean_laps: {
    id: 'clean_laps',
    label: 'Pulizia',
    tone: 'baseline',
    title: 'Allenamento Pulizia',
    intro: 'Allena giri validi guidando con ritmo. Devi essere pulito anche quando spingi, non solo andando piano.',
    sessionType: 'Prova libera',
    fuelHint: 'Medio e stabile',
    targetHint: '85% giri validi',
    referenceHint: 'Validita e punti critici',
    focus: 'Giri validi',
    target: 'Giri validi consecutivi',
    objective: 'Chiudi giri validi a ritmo vero, con margine nei punti dove di solito sporchi il giro.',
    durations: [
      {
        id: '30',
        label: '30 min',
        totalLabel: '30 min totali',
        timeline: [
          { label: 'Warm-up', duration: '10 min', detail: 'Porta gomme e riferimenti in finestra.' },
          { label: 'Lavoro pulito', duration: '15 min', detail: 'Spingi con margine e chiudi giri validi.' },
          { label: 'Note', duration: '5 min', detail: 'Segna dove invalidi o perdi controllo.' }
        ]
      },
      {
        id: '60',
        label: '60 min',
        totalLabel: '60 min totali',
        timeline: [
          { label: 'Warm-up', duration: '10 min', detail: 'Stabilizza gomme, riferimenti e ritmo.' },
          { label: 'Blocco 1', duration: '20 min', detail: 'Giri validi con margine sui punti critici.' },
          { label: 'Review', duration: '5 min', detail: 'Guarda dove sporchi e cosa ripetere.' },
          { label: 'Blocco 2', duration: '20 min', detail: 'Ripeti il lavoro senza alzare il rischio.' },
          { label: 'Note', duration: '5 min', detail: 'Segna invalidi, errori e prossima priorita.' }
        ]
      }
    ],
    goals: [
      'Chiudi almeno 85% giri validi.',
      'Tieni piu giri consecutivi senza errori grossi.',
      'Spingi con controllo, senza passeggiare.'
    ],
    doRules: [
      'Tieni margine nei punti dove invalidi.',
      'Usa riferimenti semplici.',
      'Spingi solo dove hai controllo.'
    ],
    avoidRules: [
      'Cordoli rischiosi.',
      'Hotlap forzato.',
      'Recuperare un errore spingendo di piu.'
    ]
  },
  qualifying: {
    id: 'qualifying',
    label: 'Qualifica',
    tone: 'clean',
    title: 'Allenamento Qualifica',
    intro: 'Allena il giro forte quando serve. Pochi tentativi, pressione alta, niente mezzora per trovare il giro buono.',
    sessionType: 'Qualifica',
    fuelHint: 'Basso, massimo 20 L',
    targetHint: '1 giro forte valido',
    referenceHint: 'Best pista o target manuale',
    focus: 'Giro competitivo',
    target: '1 giro forte valido',
    objective: 'Tira fuori un giro valido forte in pochi tentativi, senza aspettare mezzora per il giro perfetto.',
    durations: [
      {
        id: '30',
        label: '30 min',
        totalLabel: '30 min totali',
        timeline: [
          { label: 'Warm-up', duration: '10 min', detail: 'Prepara riferimenti e gomme.' },
          { label: 'Run qualifica', duration: '15 min', detail: 'Outlap e pochi push lap per run.' },
          { label: 'Note', duration: '5 min', detail: 'Segna dove perdi il giro valido.' }
        ]
      },
      {
        id: '60',
        label: '60 min',
        totalLabel: '60 min totali',
        timeline: [
          { label: 'Warm-up', duration: '10 min', detail: 'Riferimenti chiari prima dei push.' },
          { label: 'Run qualifica', duration: '40 min', detail: 'Pochi tentativi per run, pressione alta.' },
          { label: 'Review', duration: '5 min', detail: 'Controlla validita e best dei blocchi.' },
          { label: 'Note', duration: '5 min', detail: 'Scrivi cosa portare alla prossima qualifica.' }
        ]
      }
    ],
    goals: [
      'Tira fuori almeno 1 giro valido competitivo.',
      'Butta via pochi tentativi.',
      'Il primo push lap deve gia essere serio.'
    ],
    doRules: [
      'Usa fuel basso.',
      'Fai outlap pulito.',
      'Spingi deciso nei lap utili.'
    ],
    avoidRules: [
      'Girare a oltranza.',
      'Invalidare cercando troppo cordolo.',
      'Cambiare setup tra le run.'
    ]
  },
  consistency: {
    id: 'consistency',
    label: 'Costanza',
    tone: 'pace',
    title: 'Allenamento Costanza',
    intro: 'Allena passo gara da solo. Il giro veloce conta poco se non riesci a ripeterlo.',
    sessionType: 'Prova libera',
    fuelHint: 'Medio/alto, coerente gara',
    targetHint: 'Target manuale o stint',
    referenceHint: 'Manuale o passo stint',
    focus: 'Passo stabile',
    target: 'Passo stabile',
    objective: 'Ripeti lo stesso passo con fuel coerente da gara, controllando validita e calo finale.',
    durations: [
      {
        id: '30',
        label: '30 min',
        totalLabel: '30 min totali',
        timeline: [
          { label: 'Warm-up', duration: '10 min', detail: 'Stabilizza gomme e ritmo.' },
          { label: 'Stint', duration: '15 min', detail: 'Gira da solo con passo ripetibile.' },
          { label: 'Review', duration: '5 min', detail: 'Controlla validi, media e calo finale.' }
        ]
      },
      {
        id: '60',
        label: '60 min',
        totalLabel: '60 min totali',
        timeline: [
          { label: 'Warm-up', duration: '10 min', detail: 'Prepara riferimenti e ritmo.' },
          { label: 'Stint 1', duration: '20 min', detail: 'Primo blocco a passo gara.' },
          { label: 'Review', duration: '5 min', detail: 'Guarda tempi e giri fuori target.' },
          { label: 'Stint 2', duration: '20 min', detail: 'Ripeti correggendo il blocco precedente.' },
          { label: 'Note', duration: '5 min', detail: 'Segna target e punti deboli.' }
        ]
      }
    ],
    goals: [
      'Tieni la maggior parte dei giri nel target.',
      'Resta pulito fino alla fine.',
      'Non crollare quando cambia il fuel.'
    ],
    doRules: [
      'Usa fuel coerente da gara.',
      'Tieni lo stesso setup.',
      'Guida ripetibile, non spettacolare.'
    ],
    avoidRules: [
      'Cercare il best a ogni giro.',
      'Fermarti appena sbagli.',
      'Giudicare solo il giro migliore.'
    ]
  },
  race_real: {
    id: 'race_real',
    label: 'Gara vera',
    tone: 'race',
    title: 'Allenamento Gara vera',
    intro: 'Allena quello che succede davvero: partenza, traffico, pressione, linee sporche, difesa, attacco e pit.',
    sessionType: 'LFM, online o gara AI',
    fuelHint: 'Regole gara',
    targetHint: 'Gara pulita',
    referenceHint: 'Risultato e note gara',
    focus: 'Racecraft',
    target: 'Gara pulita',
    objective: 'Completa una gara con partenza, traffico e decisioni pulite. Se c\'e sosta, falla senza errori.',
    durations: [
      {
        id: '20',
        label: '20 min',
        totalLabel: '20 min sprint',
        timeline: [
          { label: 'Griglia', duration: '3 min', detail: 'Parti in mezzo o dal fondo.' },
          { label: 'Gara', duration: '15 min', detail: 'Traffico, linee alternative e pressione.' },
          { label: 'Note', duration: '2 min', detail: 'Segna contatti, errori e decisioni.' }
        ]
      },
      {
        id: '40',
        label: '40 min',
        totalLabel: '40 min LFM',
        timeline: [
          { label: 'Preparazione', duration: '5 min', detail: 'Regole, fuel, pit e partenza.' },
          { label: 'Gara', duration: '30 min', detail: 'Gestisci traffico, passo e difesa.' },
          { label: 'Note', duration: '5 min', detail: 'Segna episodi chiave e pit.' }
        ]
      },
      {
        id: '60',
        label: '60 min',
        totalLabel: '60 min lunga',
        timeline: [
          { label: 'Preparazione', duration: '5 min', detail: 'Regole, fuel e piano pit.' },
          { label: 'Gara', duration: '50 min', detail: 'Completa stint, traffico e pressione.' },
          { label: 'Note', duration: '5 min', detail: 'Segna errori, sorpassi e gestione.' }
        ]
      }
    ],
    goals: [
      'Completa la gara senza caos.',
      'Gestisci traffico e linee non ideali.',
      'Se previsto, fai la sosta senza errori.'
    ],
    doRules: [
      'Parti anche da meta gruppo o fondo.',
      'Lascia margine nei primi giri.',
      'Difendi e attacca senza forzare.'
    ],
    avoidRules: [
      'Guidare come in hotlap.',
      'Rischiare tutto in partenza.',
      'Uscire appena la gara si mette male.'
    ]
  }
}

const isTrainingId = (value: unknown): value is TrainingId => {
  return typeof value === 'string' && trainingOrder.includes(value as TrainingId)
}

const normalizeScenario = (value: unknown): TrainingId => {
  if (isTrainingId(value)) return value
  if (typeof value === 'string' && legacyScenarioMap[value]) return legacyScenarioMap[value]
  return 'clean_laps'
}

const initialTraining = computed<TrainingId>(() => normalizeScenario(route.query.scenario))
const selectedTraining = ref<TrainingId>(initialTraining.value)
const selectedDuration = ref<DurationId>('30')

watch(initialTraining, (scenario) => {
  selectedTraining.value = scenario
})

const selectedPlan = computed(() => trainingPlans[selectedTraining.value])
const toneClass = computed(() => `tone-${selectedPlan.value.tone}`)

watch(selectedPlan, (plan) => {
  const hasDuration = plan.durations.some((duration) => duration.id === selectedDuration.value)
  if (!hasDuration) {
    selectedDuration.value = plan.durations[0]?.id || '30'
  }
}, { immediate: true })

const selectedDurationPlan = computed(() => {
  return selectedPlan.value.durations.find((duration) => duration.id === selectedDuration.value)
    || selectedPlan.value.durations[0]!
})
</script>

<template>
  <LayoutPageContainer>
    <div class="prep-page" :class="toneClass">
      <header class="prep-hero">
        <div class="prep-hero__copy">
          <span class="eyebrow">Preparazione allenamento</span>
          <h1>{{ selectedPlan.title }}</h1>
          <p>{{ selectedPlan.intro }}</p>
        </div>
      </header>

      <section class="prep-layout">
        <article class="prep-card prep-card--primary objective-card">
          <div class="objective-topline">
            <div class="objective-label">
              <span class="eyebrow">Obiettivo pilota</span>
              <strong>{{ selectedDurationPlan.totalLabel }}</strong>
            </div>

            <div class="duration-picker" aria-label="Tempo disponibile">
              <span class="duration-picker__label">Tempo disponibile</span>
              <div class="duration-tabs">
                <button
                  v-for="duration in selectedPlan.durations"
                  :key="duration.id"
                  type="button"
                  :class="['duration-tab', { 'duration-tab--active': selectedDuration === duration.id }]"
                  @click="selectedDuration = duration.id"
                >
                  {{ duration.label }}
                </button>
              </div>
            </div>
          </div>

          <h2>{{ selectedPlan.target }}</h2>
          <p>{{ selectedPlan.objective }}</p>

          <div class="session-flow" aria-label="Timeline allenamento">
            <div
              v-for="(step, index) in selectedDurationPlan.timeline"
              :key="`${selectedPlan.id}-${selectedDurationPlan.id}-${step.label}`"
              class="flow-step"
              :class="{ 'flow-step--work': index === 1 || selectedDurationPlan.timeline.length === 1 }"
            >
              <span>{{ step.label }}</span>
              <strong>{{ step.duration }}</strong>
              <small>{{ step.detail }}</small>
            </div>
          </div>

          <div class="quick-facts">
            <div>
              <span>Modalita ACC</span>
              <strong>{{ selectedPlan.sessionType }}</strong>
            </div>
            <div>
              <span>Carburante</span>
              <strong>{{ selectedPlan.fuelHint }}</strong>
            </div>
            <div>
              <span>Target</span>
              <strong>{{ selectedPlan.targetHint }}</strong>
            </div>
            <div>
              <span>Riferimento</span>
              <strong>{{ selectedPlan.referenceHint }}</strong>
            </div>
          </div>
        </article>

        <aside class="side-column">
          <article class="prep-card compact-card">
            <span class="eyebrow">Obiettivi</span>
            <ul class="plain-list plain-list--goals">
              <li v-for="goal in selectedPlan.goals" :key="goal">
                {{ goal }}
              </li>
            </ul>
          </article>

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
  gap: 22px;
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
.prep-card {
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
  padding: 28px 30px;
  border-radius: 18px;
}

.prep-hero h1,
.prep-card h2 {
  margin: 0;
  color: var(--text-primary);
  font-weight: 800;
}

.prep-hero h1 {
  max-width: 780px;
  font-size: clamp(34px, 4.5vw, 54px);
  line-height: 1;
}

.prep-hero p,
.prep-card p {
  margin: 14px 0 0 0;
  color: var(--text-secondary);
  line-height: 1.55;
}

.eyebrow,
.quick-facts span {
  display: block;
  color: rgba(255, 255, 255, 0.46);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.duration-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.duration-tab {
  min-height: 36px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.055);
  color: rgba(255, 255, 255, 0.72);
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.duration-tab:hover,
.duration-tab--active {
  border-color: rgba(var(--accent-rgb), 0.48);
  background: rgba(var(--accent-rgb), 0.14);
  color: #fff;
}

.prep-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(330px, 0.8fr);
  gap: 24px;
  align-items: start;
}

.prep-card {
  padding: 24px;
  border-radius: 16px;
}

.prep-card--primary {
  border-color: rgba(var(--accent-rgb), 0.28);
}

.objective-card {
  min-height: 520px;
}

.objective-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}

.objective-label {
  display: grid;
  gap: 6px;
}

.objective-label strong {
  color: #fff;
  font-size: 13px;
}

.duration-picker {
  display: grid;
  justify-items: end;
  gap: 8px;
  flex: 0 0 auto;
}

.duration-picker__label {
  display: block;
  color: rgba(255, 255, 255, 0.46);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.objective-card h2 {
  max-width: 760px;
  font-size: clamp(38px, 5vw, 68px);
  line-height: 0.95;
}

.objective-card p {
  max-width: 680px;
  font-size: 18px;
}

.session-flow {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
  margin-top: 28px;
  padding: 14px;
  border-radius: 16px;
  background:
    linear-gradient(90deg, rgba(var(--accent-rgb), 0.16), rgba(255, 255, 255, 0.045));
  border: 1px solid rgba(var(--accent-rgb), 0.24);
}

.flow-step {
  min-width: 0;
  min-height: 130px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
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
  margin-top: 9px;
  color: #fff;
  font-size: clamp(19px, 1.7vw, 26px);
  font-weight: 900;
  line-height: 1.15;
}

.flow-step small {
  display: block;
  margin-top: 10px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 13px;
  line-height: 1.35;
}

.quick-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;
}

.quick-facts > div {
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.quick-facts strong {
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

.plain-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 18px 0 0 0;
  list-style: none;
}

.plain-list li {
  position: relative;
  padding-left: 26px;
  color: var(--text-secondary);
  line-height: 1.45;
}

.plain-list li::before {
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

.plain-list--goals li::before {
  background: linear-gradient(135deg, var(--accent), var(--accent-end));
}

@media (max-width: 900px) {
  .prep-hero,
  .prep-layout {
    grid-template-columns: 1fr;
  }

  .objective-topline {
    align-items: flex-start;
    flex-direction: column;
  }

  .duration-picker {
    justify-items: start;
  }

  .quick-facts {
    grid-template-columns: 1fr;
  }

  .duration-tab {
    flex: 1 1 120px;
  }
}
</style>
