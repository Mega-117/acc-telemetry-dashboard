<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import {
  getCoachDisplayName,
  loadCoachById,
  type CoachDirectoryItem
} from '~/repositories/coachDirectoryRepository'

const { currentUser, getUserProfile } = useFirebaseAuth()

const currentCoach = ref<CoachDirectoryItem | null>(null)
const coachId = ref<string | null>(null)
const isLoading = ref(false)

const currentCoachName = computed(() => getCoachDisplayName(currentCoach.value) || 'Nessun coach associato')

async function loadAssociation() {
  if (!currentUser.value) return
  isLoading.value = true
  try {
    const profile = await getUserProfile(currentUser.value.uid)
    coachId.value = profile?.coachId || null
    currentCoach.value = await loadCoachById(coachId.value)
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await loadAssociation()
})
</script>

<template>
  <section class="profile-card coach-card">
    <div class="card-head">
      <h3 class="card-title">Coach associato</h3>
      <span class="status-dot" :class="{ 'status-dot--active': !!coachId }"></span>
    </div>

    <div class="current-coach">
      <div class="coach-avatar">{{ currentCoachName.slice(0, 2).toUpperCase() }}</div>
      <div>
        <p class="coach-label">{{ isLoading ? 'Caricamento...' : currentCoachName }}</p>
        <span>{{ coachId ? 'Associazione attiva' : 'Nessun coach assegnato al tuo profilo' }}</span>
      </div>
    </div>

    <p class="assignment-note">
      L'associazione viene gestita fuori dal profilo pilota. In questo modo le lezioni restano legate al coach realmente assegnato.
    </p>
  </section>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.profile-card {
  padding: 28px;
  background: #121218;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
}

.card-head,
.current-coach {
  display: flex;
  align-items: center;
}

.card-head {
  justify-content: space-between;
  margin-bottom: 20px;
}

.card-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);

  &--active {
    background: #22c55e;
    box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.14);
  }
}

.current-coach {
  gap: 14px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
}

.coach-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(96, 165, 250, 0.18);
  color: #60a5fa;
  font-weight: 800;
}

.coach-label {
  margin: 0 0 3px;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
}

.current-coach span {
  color: rgba(255, 255, 255, 0.48);
  font-size: 13px;
}

.assignment-note {
  margin: 16px 0 0;
  color: rgba(255, 255, 255, 0.48);
  font-size: 13px;
  line-height: 1.5;
}
</style>
