<script setup lang="ts">
import { computed } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

const { userRole } = useFirebaseAuth()

const isPilotRole = computed(() => (userRole.value || 'pilot') === 'pilot')
const showCoachAssociation = computed(() => isPilotRole.value)
const showCoachLessons = computed(() => isPilotRole.value)

const pageCopy = computed(() => {
  if (isPilotRole.value) {
    return {
      kicker: 'Area pilota',
      title: 'Programma e coaching',
      description: 'Gare pianificate, coach associato e storico lezioni.'
    }
  }

  return {
    kicker: 'Area personale',
    title: 'Programma personale',
    description: 'Calendario gare e appuntamenti personali del tuo profilo pilota.'
  }
})
</script>

<template>
  <div class="pilot-area-page">
    <header class="pilot-area-header">
      <div>
        <p class="page-kicker">{{ pageCopy.kicker }}</p>
        <h1>{{ pageCopy.title }}</h1>
        <p>{{ pageCopy.description }}</p>
      </div>
    </header>

    <div class="pilot-area-grid" :class="{ 'pilot-area-grid--single': !showCoachAssociation }">
      <ProfileRaceCalendarCard class="area-card area-card--calendar" />
      <ProfileCoachAssociationCard v-if="showCoachAssociation" class="area-card area-card--coach" />
    </div>

    <ProfileCoachLessonsCard v-if="showCoachLessons" class="area-card lessons-section" />
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.pilot-area-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 34px 24px 52px;
  color: #fff;
  font-family: $font-primary;
}

.pilot-area-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;

  h1 {
    margin: 0 0 8px;
    font-size: 30px;
    font-weight: 850;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.58);
    font-size: 14px;
  }
}

.page-kicker {
  margin-bottom: 8px !important;
  color: $racing-orange !important;
  font-size: 12px !important;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pilot-area-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
  gap: 24px;
  align-items: stretch;
  margin-bottom: 24px;

  &--single {
    grid-template-columns: minmax(0, 760px);
  }
}

.area-card {
  min-width: 0;
}

.lessons-section {
  width: 100%;
}

@media (max-width: 1000px) {
  .pilot-area-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .pilot-area-page {
    padding: 24px 16px 40px;
  }

  .pilot-area-header h1 {
    font-size: 24px;
  }
}
</style>
