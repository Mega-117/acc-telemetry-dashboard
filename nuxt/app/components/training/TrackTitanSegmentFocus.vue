<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  trackTitanRequirements as requirements,
  trackTitanRules as rules,
  trackTitanStepTypeLabels as stepTypeLabels,
  trackTitanTrainingModes as trainingModes,
  type TrackTitanDurationModeId,
  type TrackTitanTrainingStep
} from '~/config/trackTitanSegmentFocus'

const selectedModeId = ref<TrackTitanDurationModeId>('short30')
const activeStepIndex = ref(0)

const selectedMode = computed(() => trainingModes[selectedModeId.value])
const activeStep = computed<TrackTitanTrainingStep>(() => {
  return selectedMode.value.steps[activeStepIndex.value] || selectedMode.value.steps[0]!
})

function selectMode(modeId: TrackTitanDurationModeId) {
  selectedModeId.value = modeId
  activeStepIndex.value = 0
}

function selectStep(index: number) {
  activeStepIndex.value = index
}
</script>

<template>
  <div class="segment-focus">
    <header class="segment-hero">
      <div class="hero-copy">
        <span class="segment-kicker">Preparazione allenamento</span>
        <h1>TrackTitan Segment Focus</h1>
        <p>Scegli da TrackTitan dove perdi, correggi freno e gas, poi riprova.</p>
      </div>

    </header>

    <section class="planning-layout">
      <article class="panel planning-panel">
        <div class="planning-section planning-section--requirements">
          <div class="section-heading">
            <span>Prima di iniziare</span>
            <h2>Requisiti</h2>
          </div>

          <div class="requirement-list">
            <div
              v-for="requirement in requirements"
              :key="requirement.id"
              class="requirement-item"
            >
              <span>
                <strong>{{ requirement.label }}</strong>
                <small>{{ requirement.meta }}</small>
              </span>
            </div>
          </div>
        </div>

        <div class="planning-divider" aria-hidden="true" />

        <div class="planning-section planning-section--timeline">
          <div class="timeline-heading">
            <div class="section-heading">
              <span>Sessione</span>
              <h2>Timeline allenamento</h2>
            </div>

            <div class="duration-control">
              <span>Durata allenamento</span>
              <div class="duration-toggle" aria-label="Durata allenamento">
                <button
                  v-for="mode in trainingModes"
                  :key="mode.id"
                  type="button"
                  :class="{ 'duration-toggle__button--active': selectedModeId === mode.id }"
                  @click="selectMode(mode.id)"
                >
                  {{ mode.title }}
                </button>
              </div>
            </div>
          </div>

          <div class="timeline-list">
            <button
              v-for="(step, index) in selectedMode.steps"
              :key="step.id"
              type="button"
              :aria-pressed="activeStepIndex === index"
              @click="selectStep(index)"
              :class="[
                'timeline-step',
                `timeline-step--${step.type}`,
                { 'timeline-step--active': activeStepIndex === index }
              ]"
            >
              <span class="step-copy">
                <small>{{ stepTypeLabels[step.type] }}</small>
                <strong>{{ step.durationMinutes }} min</strong>
                <span>{{ step.title }}</span>
              </span>
            </button>
          </div>
        </div>
      </article>
    </section>

    <section class="execution-layout">
      <article class="panel active-step-panel active-step-panel--primary">
        <div class="active-step-top">
          <div class="section-heading">
            <span>Step attivo</span>
            <h2>{{ activeStep.title }}</h2>
          </div>
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

      <article class="panel rules-panel">
        <div class="section-heading">
          <span>Focus</span>
          <h2>Da tenere sempre</h2>
        </div>
        <ul>
          <li v-for="rule in rules" :key="rule">
            {{ rule }}
          </li>
        </ul>
      </article>
    </section>
  </div>
</template>

<style scoped lang="scss">
.segment-focus {
  --focus-accent: #22c55e;
  --focus-accent-rgb: 34, 197, 94;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.segment-hero,
.panel {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    radial-gradient(circle at top left, rgba(var(--focus-accent-rgb), 0.12), transparent 34%),
    linear-gradient(145deg, rgba(26, 26, 36, 0.98), rgba(12, 12, 18, 0.98));
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.22);
}

.segment-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  padding: 22px 28px;
  border-radius: 18px;
}

.segment-kicker,
.section-heading span {
  display: block;
  color: rgba(255, 255, 255, 0.46);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.segment-hero h1 {
  margin: 8px 0 0;
  color: #fff;
  font-size: clamp(34px, 3.8vw, 50px);
  line-height: 1;
}

.segment-hero p {
  max-width: 620px;
  margin: 14px 0 0;
  color: var(--text-secondary);
  font-size: 18px;
  line-height: 1.45;
}

.duration-control > span {
  color: rgba(255, 255, 255, 0.46);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.duration-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
}

.duration-toggle__button--active {
  background: var(--focus-accent) !important;
  color: #06140b !important;
}

.panel {
  padding: 22px;
  border-radius: 16px;
}

.planning-layout {
  display: grid;
}

.planning-panel {
  display: grid;
  gap: 22px;
  padding: 24px;
}

.planning-section {
  min-width: 0;
}

.planning-divider {
  height: 1px;
  background: linear-gradient(90deg, rgba(var(--focus-accent-rgb), 0.3), rgba(255, 255, 255, 0.06), transparent);
}

.execution-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  gap: 24px;
  align-items: start;
}

.section-heading h2 {
  margin: 6px 0 0;
  color: #fff;
  font-size: clamp(22px, 2.5vw, 32px);
  line-height: 1.1;
}

.requirement-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.requirement-item {
  min-height: 58px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.045);
}

.requirement-item strong,
.coach-replay-note strong {
  display: block;
  color: #fff;
  font-size: 15px;
}

.requirement-item small {
  display: block;
  margin-top: 5px;
  color: rgba(255, 255, 255, 0.56);
  font-size: 12px;
  line-height: 1.35;
}

.coach-replay-note {
  margin-top: 14px;
  padding: 14px;
  border-radius: 14px;
  border: 1px dashed rgba(var(--focus-accent-rgb), 0.35);
  background: rgba(var(--focus-accent-rgb), 0.08);
}

.coach-replay-note p,
.session-state {
  margin: 6px 0 0;
  color: rgba(255, 255, 255, 0.62);
  line-height: 1.45;
}

.timeline-heading {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-end;
}

.duration-control {
  display: grid;
  gap: 8px;
  width: min(260px, 100%);
}

.timeline-list {
  --timeline-card-width: 140px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: stretch;
  margin-top: 16px;
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
  border-color: rgba(var(--focus-accent-rgb), 0.38);
  transform: translateY(-1px);
}

.timeline-step--active {
  border-color: rgba(var(--focus-accent-rgb), 0.64);
  background:
    linear-gradient(145deg, rgba(21, 104, 66, 0.88), rgba(15, 69, 52, 0.94));
  box-shadow: inset 0 0 0 1px rgba(var(--focus-accent-rgb), 0.14);
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

.active-step-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.active-step-panel--primary {
  border-color: rgba(var(--focus-accent-rgb), 0.2);
  padding: 20px 22px;
  background:
    radial-gradient(circle at top left, rgba(var(--focus-accent-rgb), 0.14), transparent 42%),
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

.step-detail-grid h3,
.rules-panel h2 {
  color: #fff;
}

.step-detail-grid h3 {
  margin: 0 0 12px;
  font-size: 14px;
}

.step-detail-grid ul,
.rules-panel ul {
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-detail-grid li,
.rules-panel li {
  position: relative;
  padding-left: 20px;
  color: rgba(255, 255, 255, 0.66);
  line-height: 1.36;
}

.step-detail-grid li::before,
.rules-panel li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.58em;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--focus-accent);
}

.rules-panel ul {
  margin-top: 16px;
}

@media (max-width: 1000px) {
  .segment-hero,
  .execution-layout,
  .requirement-list,
  .step-detail-grid {
    grid-template-columns: 1fr;
  }

  .timeline-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .duration-control {
    width: min(320px, 100%);
  }
}
</style>
