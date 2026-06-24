<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

definePageMeta({
  layout: 'dashboard'
})

type PrepTone = 'baseline' | 'pace' | 'race' | 'clean' | 'success'
type TrainingId = 'tracktitan_input' | 'clean_laps' | 'qualifying' | 'consistency' | 'race_real'
type DurationId = '30' | '60'

interface TimelineStep {
  label: string
  duration: string
  title: string
  instructions: string[]
  dont: string[]
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
  target: string
  objective: string
  durations: DurationPlan[]
  goals: string[]
  rules: string[]
  avoidRules: string[]
}

const route = useRoute()
const router = useRouter()

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
    intro: 'Correggi freno e gas nei segmenti dove sei diverso dal riferimento.',
    sessionType: 'Prova libera',
    fuelHint: 'Stabile, come il riferimento',
    targetHint: '1 segmento alla volta',
    referenceHint: 'Coach o giro confronto',
    target: 'Input simili al coach',
    objective: 'Scegli un segmento, confronta freno e gas, poi torna in pista con una correzione.',
    durations: [],
    goals: [],
    rules: [],
    avoidRules: []
  },
  clean_laps: {
    id: 'clean_laps',
    label: 'Pulizia',
    tone: 'baseline',
    title: 'Allenamento Pulizia',
    intro: 'Spingi con margine e chiudi giri validi. Il ritmo serve, ma il giro deve restare pulito.',
    sessionType: 'Prova libera',
    fuelHint: 'Medio e stabile',
    targetHint: 'Giri validi',
    referenceHint: 'Invalidi ed errori',
    target: 'Giri validi con margine',
    objective: 'Allenare il controllo nei punti dove sporchi il giro senza trasformare tutto in hotlap.',
    durations: [
      {
        id: '30',
        label: '30 min',
        totalLabel: '30 min totali',
        timeline: [
          {
            label: 'Warm-up',
            duration: '10 min',
            title: 'Stabilizza guida',
            instructions: [
              'Porta gomme e riferimenti in finestra.',
              'Trova ritmo senza cercare subito il limite.'
            ],
            dont: [
              'Non forzare cordoli o ingressi.',
              'Non giudicare il lavoro dal primo giro.'
            ]
          },
          {
            label: 'Lavoro',
            duration: '15 min',
            title: 'Giri validi',
            instructions: [
              'Spingi con margine nei punti critici.',
              'Chiudi piu giri validi consecutivi possibili.',
              'Se sporchi un punto, riparti pulito dal giro dopo.'
            ],
            dont: [
              'Non cercare il giro perfetto.',
              'Non recuperare un errore rischiando di piu.'
            ]
          },
          {
            label: 'Recap',
            duration: '5 min',
            title: 'Cosa e successo',
            instructions: [
              'Segna cosa hai fatto bene.',
              'Segna dove hai avuto difficolta.',
              'Scegli il punto da ripetere la prossima volta.'
            ],
            dont: [
              'Non limitarti al tempo migliore.',
              'Non ignorare gli invalidi.'
            ]
          }
        ]
      },
      {
        id: '60',
        label: '60 min',
        totalLabel: '60 min totali',
        timeline: [
          {
            label: 'Warm-up',
            duration: '10 min',
            title: 'Stabilizza ritmo',
            instructions: [
              'Porta gomme e riferimenti in finestra.',
              'Costruisci un ritmo pulito prima del lavoro.'
            ],
            dont: [
              'Non spingere subito oltre il margine.',
              'Non cambiare riferimenti a ogni giro.'
            ]
          },
          {
            label: 'Lavoro',
            duration: '20 min',
            title: 'Blocco validi',
            instructions: [
              'Spingi con margine e chiudi giri validi.',
              'Proteggi i punti dove invalidi spesso.',
              'Tieni il ritmo senza alzare il rischio.'
            ],
            dont: [
              'Non cercare il best lap.',
              'Non usare cordoli che non controlli.'
            ]
          },
          {
            label: 'Review',
            duration: '5 min',
            title: 'Pausa analisi',
            instructions: [
              'Guarda dove hai invalidato o sporcato.',
              'Scegli un solo punto da ripetere nel secondo blocco.'
            ],
            dont: [
              'Non cambiare setup.',
              'Non analizzare tutto come una qualifica.'
            ]
          },
          {
            label: 'Lavoro',
            duration: '20 min',
            title: 'Ripeti pulito',
            instructions: [
              'Ripeti il lavoro con lo stesso margine.',
              'Correggi solo il punto scelto nella review.',
              'Chiudi giri validi anche se perdi qualche decimo.'
            ],
            dont: [
              'Non alzare il rischio per recuperare tempo.',
              'Non cambiare obiettivo a meta blocco.'
            ]
          },
          {
            label: 'Recap',
            duration: '5 min',
            title: 'Prossima priorita',
            instructions: [
              'Segna cosa hai fatto.',
              'Segna difficolta e cose andate bene.',
              'Decidi il punto da rivedere nella prossima sessione.'
            ],
            dont: [
              'Non valutare solo il best.',
              'Non lasciare note generiche.'
            ]
          }
        ]
      }
    ],
    goals: [
      'Chiudere giri validi a ritmo reale.',
      'Tenere margine nei punti critici.',
      'Capire dove sporchi piu spesso.'
    ],
    rules: [
      'Spingi, ma con margine.',
      'Priorita ai giri validi.',
      'Proteggi i punti dove invalidi.',
      'Un errore non cambia il piano.',
      'Niente hotlap forzato.',
      'Recap: cose fatte, difficolta, cose buone.'
    ],
    avoidRules: [
      'Hotlap forzato.',
      'Cordoli rischiosi.',
      'Cambiare obiettivo durante il blocco.'
    ]
  },
  qualifying: {
    id: 'qualifying',
    label: 'Qualifica',
    tone: 'clean',
    title: 'Allenamento Qualifica',
    intro: 'Simula la pressione della qualifica: pochi tentativi, fuel basso, giro valido forte.',
    sessionType: 'Qualifica',
    fuelHint: 'Basso',
    targetHint: 'Push lap validi',
    referenceHint: 'Best o target manuale',
    target: 'Giro forte in pochi tentativi',
    objective: 'Allenare la capacita di tirare fuori un giro competitivo senza aspettare troppi tentativi.',
    durations: [
      {
        id: '30',
        label: '30 min',
        totalLabel: '30 min totali',
        timeline: [
          {
            label: 'Warm-up',
            duration: '5 min',
            title: 'Prepara riferimenti',
            instructions: [
              'Scalda gomme e freni.',
              'Rendi chiari i riferimenti prima del primo push.'
            ],
            dont: [
              'Non cercare subito il giro bomba.',
              'Non consumare concentrazione nel warm-up.'
            ]
          },
          {
            label: 'Stint',
            duration: '10 min',
            title: 'Qualifica 1',
            instructions: [
              'Fai outlap pulito e push lap seri.',
              'L obiettivo e almeno un giro forte valido.'
            ],
            dont: [
              'Non girare a caso.',
              'Non invalidare per mezzo cordolo.'
            ]
          },
          {
            label: 'Pausa',
            duration: '2 min',
            title: 'Reset rapido',
            instructions: [
              'Respira e scegli cosa correggere.',
              'Tieni una sola priorita per il secondo stint.'
            ],
            dont: [
              'Non cambiare setup.',
              'Non trasformare la pausa in analisi lunga.'
            ]
          },
          {
            label: 'Stint',
            duration: '10 min',
            title: 'Qualifica 2',
            instructions: [
              'Ripeti con la correzione scelta.',
              'Cerca un giro valido forte senza aumentare il rischio inutile.'
            ],
            dont: [
              'Non inseguire ogni micro errore.',
              'Non restare in pista se il run e finito.'
            ]
          },
          {
            label: 'Recap',
            duration: '3 min',
            title: 'Esito qualifica',
            instructions: [
              'Segna miglior giro valido.',
              'Segna dove hai perso il giro.',
              'Decidi il riferimento per il prossimo lavoro.'
            ],
            dont: [
              'Non guardare solo il delta finale.',
              'Non ignorare i giri invalidati.'
            ]
          }
        ]
      },
      {
        id: '60',
        label: '60 min',
        totalLabel: '60 min totali',
        timeline: [
          {
            label: 'Warm-up',
            duration: '10 min',
            title: 'Riferimenti chiari',
            instructions: [
              'Scalda gomme e freni.',
              'Fissa i riferimenti prima dei push lap.'
            ],
            dont: [
              'Non sprecare tentativi da qualifica.',
              'Non cambiare setup a sessione iniziata.'
            ]
          },
          {
            label: 'Pausa',
            duration: '2 min',
            title: 'Pronto run 1',
            instructions: [
              'Resetta e prepara il primo stint.',
              'Una priorita tecnica, niente lista lunga.'
            ],
            dont: [
              'Non analizzare tutto il giro.'
            ]
          },
          {
            label: 'Stint',
            duration: '10 min',
            title: 'Qualifica 1',
            instructions: [
              'Outlap pulito e push lap validi.',
              'Porta a casa un primo riferimento serio.'
            ],
            dont: [
              'Non rischiare tutto al primo cordolo.',
              'Non prolungare il run.'
            ]
          },
          {
            label: 'Pausa',
            duration: '2 min',
            title: 'Reset run 2',
            instructions: [
              'Controlla solo cosa ha rovinato il run.',
              'Scegli una correzione.'
            ],
            dont: [
              'Non cambiare troppe cose.'
            ]
          },
          {
            label: 'Stint',
            duration: '10 min',
            title: 'Qualifica 2',
            instructions: [
              'Ripeti con la correzione scelta.',
              'Cerca un giro valido forte entro il blocco.'
            ],
            dont: [
              'Non inseguire il giro perfetto a ogni costo.'
            ]
          },
          {
            label: 'Pausa',
            duration: '2 min',
            title: 'Reset run 3',
            instructions: [
              'Resta sul punto piu costoso.',
              'Prepara un solo aggiustamento.'
            ],
            dont: [
              'Non buttare via il metodo.'
            ]
          },
          {
            label: 'Stint',
            duration: '10 min',
            title: 'Qualifica 3',
            instructions: [
              'Spingi deciso sui giri utili.',
              'Tieni valido il giro anche se non e perfetto.'
            ],
            dont: [
              'Non invalidare per cercare troppo cordolo.'
            ]
          },
          {
            label: 'Pausa',
            duration: '2 min',
            title: 'Reset run 4',
            instructions: [
              'Scegli l ultimo obiettivo semplice.',
              'Arriva al quarto stint senza cambiare approccio.'
            ],
            dont: [
              'Non fare analisi lunga.'
            ]
          },
          {
            label: 'Stint',
            duration: '10 min',
            title: 'Qualifica 4',
            instructions: [
              'Ultimo stint: esegui, non sperimentare.',
              'Porta a casa almeno un giro valido competitivo.'
            ],
            dont: [
              'Non cercare miracoli.',
              'Non allungare oltre il tempo.'
            ]
          },
          {
            label: 'Recap',
            duration: '2 min',
            title: 'Best valido',
            instructions: [
              'Segna best valido e run migliore.',
              'Segna cosa ripetere nella prossima qualifica.'
            ],
            dont: [
              'Non valutare solo il giro teorico.'
            ]
          }
        ]
      }
    ],
    goals: [
      'Fare un giro valido forte.',
      'Usare pochi tentativi.',
      'Arrivare pronto al primo push lap.'
    ],
    rules: [
      'Fuel basso.',
      'Outlap pulito.',
      'Push lap seri e pochi.',
      'Pausa breve: una correzione.',
      'Niente setup tra gli stint.',
      'Conta solo il giro valido.'
    ],
    avoidRules: [
      'Girare a oltranza.',
      'Cambiare setup tra gli stint.',
      'Invalidare per cercare troppo cordolo.'
    ]
  },
  consistency: {
    id: 'consistency',
    label: 'Costanza',
    tone: 'pace',
    title: 'Allenamento Costanza',
    intro: 'Allena passo gara ripetibile. Il giro veloce conta poco se il ritmo non resta stabile.',
    sessionType: 'Prova libera',
    fuelHint: 'Coerente gara',
    targetHint: 'Passo stabile',
    referenceHint: 'Media stint',
    target: 'Passo gara ripetibile',
    objective: 'Tenere ritmo, validita e controllo per tutto lo stint senza inseguire ogni singolo decimo.',
    durations: [
      {
        id: '30',
        label: '30 min',
        totalLabel: '30 min totali',
        timeline: [
          {
            label: 'Warm-up',
            duration: '8 min',
            title: 'Ritmo stabile',
            instructions: [
              'Scalda gomme e trova il passo.',
              'Imposta riferimenti che puoi ripetere.'
            ],
            dont: [
              'Non cercare subito il best lap.',
              'Non cambiare guida a ogni giro.'
            ]
          },
          {
            label: 'Lavoro',
            duration: '20 min',
            title: 'Stint costante',
            instructions: [
              'Gira con passo gara ripetibile.',
              'Tieni lo stesso margine giro dopo giro.',
              'Proteggi validita e ritmo finale.'
            ],
            dont: [
              'Non spingere ogni giro come qualifica.',
              'Non fermarti al primo errore.'
            ]
          },
          {
            label: 'Recap',
            duration: '2 min',
            title: 'Media e calo',
            instructions: [
              'Segna se il passo resta stabile.',
              'Segna dove perdi ritmo o concentrazione.'
            ],
            dont: [
              'Non valutare solo il giro migliore.'
            ]
          }
        ]
      },
      {
        id: '60',
        label: '60 min',
        totalLabel: '60 min totali',
        timeline: [
          {
            label: 'Warm-up',
            duration: '10 min',
            title: 'Prepara passo',
            instructions: [
              'Stabilizza gomme, fuel e riferimenti.',
              'Arriva al lavoro con ritmo ripetibile.'
            ],
            dont: [
              'Non forzare il limite.',
              'Non cercare setup nuovi.'
            ]
          },
          {
            label: 'Lavoro',
            duration: '20 min',
            title: 'Stint 1',
            instructions: [
              'Gira a passo gara.',
              'Tieni i giri dentro un ritmo credibile.',
              'Non sacrificare validita per un decimo.'
            ],
            dont: [
              'Non cercare il best.',
              'Non mollare dopo un giro sporco.'
            ]
          },
          {
            label: 'Review',
            duration: '5 min',
            title: 'Pausa analisi',
            instructions: [
              'Guarda media, giri fuori ritmo e invalidi.',
              'Scegli un punto da rendere piu stabile.'
            ],
            dont: [
              'Non cambiare tutto.',
              'Non giudicare solo dal giro veloce.'
            ]
          },
          {
            label: 'Lavoro',
            duration: '20 min',
            title: 'Stint 2',
            instructions: [
              'Ripeti il passo con la correzione scelta.',
              'Mantieni ritmo e margine fino alla fine.'
            ],
            dont: [
              'Non inseguire il tempo del giro singolo.',
              'Non alzare il rischio negli ultimi minuti.'
            ]
          },
          {
            label: 'Recap',
            duration: '5 min',
            title: 'Passo reale',
            instructions: [
              'Segna passo medio e stabilita.',
              'Segna cosa e migliorato e cosa resta fragile.'
            ],
            dont: [
              'Non ignorare il calo finale.',
              'Non usare solo sensazioni.'
            ]
          }
        ]
      }
    ],
    goals: [
      'Tenere passo ripetibile.',
      'Restare pulito fino alla fine.',
      'Capire dove il ritmo si rompe.'
    ],
    rules: [
      'Fuel coerente da gara.',
      'Stesso setup per tutta la sessione.',
      'Ritmo prima del giro singolo.',
      'Non fermarti al primo errore.',
      'Recap: media, calo, punti deboli.'
    ],
    avoidRules: [
      'Best lap a ogni giro.',
      'Fermarsi al primo errore.',
      'Giudicare solo dal giro migliore.'
    ]
  },
  race_real: {
    id: 'race_real',
    label: 'Gara vera',
    tone: 'race',
    title: 'Allenamento Gara vera',
    intro: 'Entra in una gara o in un gruppo: traffico, linee non ideali e pressione non si allenano da soli.',
    sessionType: 'LFM, online, gruppo o AI',
    fuelHint: 'Regole gara',
    targetHint: 'Racecraft pulito',
    referenceHint: 'Episodi gara',
    target: 'Racecraft in traffico',
    objective: 'Allenare partenza, traffico, traiettorie non ideali, difesa, attacco e gestione gara reale.',
    durations: [
      {
        id: '30',
        label: '30 min',
        totalLabel: '30 min timer',
        timeline: [
          {
            label: 'Gara',
            duration: '30 min',
            title: 'LFM o gruppo',
            instructions: [
              'Fai una gara LFM, online, AI o allenamento di gruppo.',
              'Cerca traffico e guida su traiettorie non ideali.',
              'Allena difesa, attacco e decisioni pulite.'
            ],
            dont: [
              'Non guidare come in hotlap.',
              'Non uscire appena trovi traffico o pressione.'
            ]
          }
        ]
      },
      {
        id: '60',
        label: '60 min',
        totalLabel: '60 min timer',
        timeline: [
          {
            label: 'Gara',
            duration: '60 min',
            title: 'Gara lunga',
            instructions: [
              'Fai una gara LFM o un allenamento di gruppo lungo.',
              'Cerca partenza, traffico, linee non ideali e gestione pressione.',
              'Se e prevista una sosta, eseguila senza errori.'
            ],
            dont: [
              'Non evitare il traffico.',
              'Non trasformare la gara in hotlap da solo.',
              'Non lasciare la sessione se va male.'
            ]
          }
        ]
      }
    ],
    goals: [
      'Guidare vicino ad altri piloti.',
      'Usare traiettorie non ideali.',
      'Gestire pressione, difesa, attacco e pit.'
    ],
    rules: [
      'Priorita a gara pulita.',
      'Accetta traffico e linee sporche.',
      'Partenza e primi giri con margine.',
      'Non guidare come in hotlap.',
      'Se c e pit stop, provalo.'
    ],
    avoidRules: [
      'Hotlap in aria pulita.',
      'Rischiare tutto in partenza.',
      'Abbandonare quando la gara diventa scomoda.'
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
const activeStepIndex = ref(0)

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

watch([selectedTraining, selectedDuration], () => {
  activeStepIndex.value = 0
})

function selectTrainingTab(trainingId: TrainingId) {
  if (selectedTraining.value === trainingId) return
  selectedTraining.value = trainingId
  void router.replace({
    query: {
      ...route.query,
      scenario: trainingId
    }
  })
}

const selectedDurationPlan = computed(() => {
  return selectedPlan.value.durations.find((duration) => duration.id === selectedDuration.value)
    || selectedPlan.value.durations[0]!
})

const activeStep = computed(() => {
  return selectedDurationPlan.value.timeline[activeStepIndex.value]
    || selectedDurationPlan.value.timeline[0]!
})
</script>

<template>
  <LayoutPageContainer>
    <div class="prep-page" :class="toneClass">
      <nav class="training-tabs" aria-label="Cambia allenamento">
        <button
          v-for="trainingId in trainingOrder"
          :key="trainingId"
          type="button"
          :class="{ 'training-tabs__button--active': selectedTraining === trainingId }"
          :aria-pressed="selectedTraining === trainingId"
          @click="selectTrainingTab(trainingId)"
        >
          {{ trainingPlans[trainingId].label }}
        </button>
      </nav>

      <TrainingTrackTitanSegmentFocus v-if="selectedTraining === 'tracktitan_input'" />

      <template v-else>
        <header class="prep-hero">
        <div class="prep-hero__copy">
          <span class="eyebrow">Preparazione allenamento</span>
          <h1>{{ selectedPlan.title }}</h1>
          <p>{{ selectedPlan.intro }}</p>
        </div>
      </header>

      <section class="prep-card planning-panel">
        <div class="planning-summary">
          <div class="objective-copy">
            <span class="eyebrow">Obiettivo pilota</span>
            <h2>{{ selectedPlan.target }}</h2>
            <p>{{ selectedPlan.objective }}</p>
          </div>
        </div>

        <div class="quick-facts" aria-label="Setup allenamento">
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

        <div class="planning-divider" aria-hidden="true" />

        <div class="timeline-heading">
          <div class="section-heading">
            <span>Sessione</span>
            <h2>Timeline allenamento</h2>
          </div>

          <div class="duration-control">
            <span>Durata allenamento</span>
            <div class="duration-toggle" aria-label="Durata allenamento">
              <button
                v-for="duration in selectedPlan.durations"
                :key="duration.id"
                type="button"
                :class="{ 'duration-toggle__button--active': selectedDuration === duration.id }"
                @click="selectedDuration = duration.id"
              >
                {{ duration.label }}
              </button>
            </div>
          </div>
        </div>

        <div class="timeline-list">
          <button
            v-for="(step, index) in selectedDurationPlan.timeline"
            :key="`${selectedPlan.id}-${selectedDurationPlan.id}-${index}-${step.label}`"
            type="button"
            :aria-pressed="activeStepIndex === index"
            :class="['timeline-step', { 'timeline-step--active': activeStepIndex === index }]"
            @click="activeStepIndex = index"
          >
            <span class="step-copy">
              <small>{{ step.label }}</small>
              <strong>{{ step.duration }}</strong>
              <span>{{ step.title }}</span>
            </span>
          </button>
        </div>
      </section>

      <section class="execution-layout">
        <article class="prep-card active-step-panel">
          <div class="section-heading">
            <span>Step attivo</span>
            <h2>{{ activeStep.title }}</h2>
          </div>

          <div class="step-detail-grid">
            <div>
              <h3>Cosa fare</h3>
              <ul>
                <li v-for="instruction in activeStep.instructions" :key="instruction">
                  {{ instruction }}
                </li>
              </ul>
            </div>

            <div>
              <h3>Cosa non fare</h3>
              <ul>
                <li v-for="item in activeStep.dont" :key="item">
                  {{ item }}
                </li>
              </ul>
            </div>
          </div>
        </article>

        <aside class="focus-column">
          <article class="prep-card compact-card focus-card">
            <div class="section-heading">
              <span>Focus</span>
              <h2>Da tenere sempre</h2>
            </div>
            <ul class="plain-list">
              <li v-for="rule in selectedPlan.rules" :key="rule">
                {{ rule }}
              </li>
            </ul>
          </article>
        </aside>
      </section>
      </template>
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

.training-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.035);
}

.training-tabs button {
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.training-tabs button:hover,
.training-tabs button:focus-visible {
  border-color: rgba(var(--accent-rgb), 0.32);
  color: rgba(255, 255, 255, 0.86);
}

.training-tabs__button--active {
  border-color: rgba(var(--accent-rgb), 0.46) !important;
  background: rgba(var(--accent-rgb), 0.2) !important;
  color: #fff !important;
}

.prep-hero,
.prep-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    radial-gradient(circle at top left, rgba(var(--accent-rgb), 0.12), transparent 34%),
    linear-gradient(145deg, rgba(26, 26, 36, 0.98), rgba(12, 12, 18, 0.98));
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.22);
}

.prep-hero {
  display: grid;
  padding: 22px 28px;
  border-radius: 18px;
}

.eyebrow,
.section-heading span,
.quick-facts span,
.duration-control > span {
  display: block;
  color: rgba(255, 255, 255, 0.46);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.prep-hero h1 {
  margin: 8px 0 0;
  color: #fff;
  font-size: clamp(34px, 3.8vw, 50px);
  font-weight: 800;
  line-height: 1;
}

.prep-hero p {
  max-width: 760px;
  margin: 14px 0 0;
  color: var(--text-secondary);
  font-size: 18px;
  line-height: 1.45;
}

.prep-card {
  padding: 22px;
  border-radius: 16px;
}

.planning-panel {
  display: grid;
  gap: 20px;
  border-color: rgba(var(--accent-rgb), 0.22);
}

.planning-summary {
  display: block;
}

.objective-copy h2,
.section-heading h2 {
  margin: 6px 0 0;
  color: #fff;
  line-height: 1.1;
}

.objective-copy h2 {
  max-width: 720px;
  font-size: clamp(24px, 3vw, 36px);
}

.objective-copy p {
  max-width: 760px;
  margin: 12px 0 0;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.5;
}

.section-heading h2 {
  font-size: clamp(22px, 2.4vw, 31px);
}

.duration-control {
  display: grid;
  gap: 8px;
  width: min(260px, 100%);
}

.duration-toggle {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 6px;
  width: 100%;
  padding: 4px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
}

.duration-toggle button {
  min-height: 34px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}

.duration-toggle__button--active {
  background: var(--accent) !important;
  color: #06140b !important;
}

.quick-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.quick-facts > div {
  min-width: 0;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.quick-facts strong {
  display: block;
  margin-top: 6px;
  color: #fff;
  font-size: 14px;
  line-height: 1.25;
}

.planning-divider {
  height: 1px;
  background: linear-gradient(90deg, rgba(var(--accent-rgb), 0.3), rgba(255, 255, 255, 0.06), transparent);
}

.timeline-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
}

.timeline-list {
  --timeline-card-width: 144px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: stretch;
}

.timeline-step {
  display: grid;
  flex: 0 0 var(--timeline-card-width);
  width: var(--timeline-card-width);
  min-height: 136px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background:
    linear-gradient(145deg, rgba(42, 47, 54, 0.82), rgba(27, 28, 34, 0.92));
  color: #fff;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}

.timeline-step:hover,
.timeline-step:focus-visible {
  border-color: rgba(var(--accent-rgb), 0.38);
  transform: translateY(-1px);
}

.timeline-step--active {
  border-color: rgba(var(--accent-rgb), 0.64);
  background:
    linear-gradient(145deg, rgba(var(--accent-rgb), 0.36), rgba(20, 24, 31, 0.94));
  box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), 0.14);
}

.step-copy strong {
  display: block;
  color: #fff;
  font-size: 28px;
  line-height: 1;
  white-space: nowrap;
}

.step-copy small {
  display: block;
  margin-bottom: 7px;
  color: rgba(190, 215, 235, 0.76);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.step-copy span {
  display: block;
  margin-top: 12px;
  color: rgba(225, 235, 245, 0.76);
  font-size: 13px;
  line-height: 1.28;
}

.execution-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  gap: 24px;
  align-items: start;
}

.active-step-panel {
  border-color: rgba(var(--accent-rgb), 0.2);
  background:
    radial-gradient(circle at top left, rgba(var(--accent-rgb), 0.14), transparent 42%),
    linear-gradient(145deg, rgba(24, 27, 31, 0.98), rgba(12, 12, 18, 0.98));
}

.step-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.step-detail-grid > div {
  min-width: 0;
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.step-detail-grid h3 {
  margin: 0 0 12px;
  color: #fff;
  font-size: 14px;
}

.step-detail-grid ul,
.plain-list {
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-detail-grid li,
.plain-list li {
  position: relative;
  padding-left: 20px;
  color: rgba(255, 255, 255, 0.66);
  line-height: 1.36;
}

.step-detail-grid li::before,
.plain-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.58em;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 18px rgba(var(--accent-rgb), 0.36);
}

.focus-column {
  display: block;
}

.compact-card {
  padding: 20px;
}

.focus-card {
  min-height: 100%;
}

.plain-list {
  margin-top: 14px;
}

@media (max-width: 1100px) {
  .execution-layout {
    grid-template-columns: 1fr;
  }

  .focus-column {
    display: block;
  }
}

@media (max-width: 760px) {
  .training-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .training-tabs button {
    padding: 0 10px;
  }

  .prep-hero,
  .prep-card {
    padding: 18px;
  }

  .quick-facts,
  .step-detail-grid,
  .focus-column {
    grid-template-columns: 1fr;
  }

  .timeline-list {
    --timeline-card-width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .timeline-step {
    width: auto;
    flex-basis: auto;
  }
}
</style>


