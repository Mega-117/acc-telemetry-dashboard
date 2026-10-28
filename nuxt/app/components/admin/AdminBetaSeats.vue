<script setup lang="ts">
// Beta seats (28/10): how many are taken and the single field that changes the cap.
import { onMounted, ref } from 'vue'
import { readBetaSeats, setBetaSeatLimit } from '~/services/auth/betaSeatService'

const seats = ref<{ taken: number; limit: number } | null>(null)
const draft = ref<number | null>(null)
const status = ref('')
const busy = ref(false)

async function load() {
  status.value = ''
  try {
    seats.value = await readBetaSeats()
    draft.value = seats.value?.limit ?? null
    if (!seats.value) status.value = 'Posti beta non ancora configurati.'
  } catch { status.value = 'Lettura non riuscita.' }
}

async function save() {
  if (draft.value === null || busy.value) return
  busy.value = true; status.value = ''
  try { await setBetaSeatLimit(Number(draft.value)); await load(); status.value = 'Tetto salvato.' }
  catch { status.value = 'Salvataggio non riuscito.' }
  finally { busy.value = false }
}

onMounted(load)
</script>

<template>
  <section class="beta-seats" aria-label="Posti beta">
    <h2>Posti beta</h2>
    <p v-if="seats"><strong>{{ seats.taken }}</strong> presi su <strong>{{ seats.limit }}</strong></p>
    <form v-if="seats" @submit.prevent="save">
      <label>Tetto <input v-model.number="draft" type="number" min="0" max="10000" step="1"></label>
      <button class="rc-btn" type="submit" :disabled="busy || draft === seats.limit">Salva</button>
    </form>
    <p v-if="status" role="status" class="beta-seats__status">{{ status }}</p>
  </section>
</template>

<style scoped>
.beta-seats { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin: 0 0 16px; padding: 12px 16px; border: 1px solid #ffffff25; background: #ffffff08; }
h2 { margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: .06em; }
p { margin: 0; }
form { display: flex; align-items: center; gap: 10px; }
input { width: 90px; padding: 6px 8px; color: inherit; background: #0003; border: 1px solid #ffffff40; }
.beta-seats__status { color: #b3b3b8; }
</style>
