<script setup lang="ts">
// PIP-615: "Giorno X di 7" della settimana di stabilita', con l'azzeramento per un bug critico.
// Un contatore unico per Develop e Produzione (decisione utente 26/10); dato sul Worker.
import { computed, onMounted, ref, watch } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { resolveDiagnosticsOrigin } from '~/repositories/diagnosticBundlesRepository'
import { loadStabilityState, resetStabilityWeek, type StabilityDeps } from '~/repositories/adminStabilityRepository'
import { STABILITY_WEEK_DAYS, localDay, stabilityWeekDay, type StabilityState } from '~/utils/adminStabilityWeek'

const props = defineProps<{ nowMs: number }>()
const { currentUser } = useFirebaseAuth()
const deps: StabilityDeps = {
  getToken: async () => (await currentUser.value?.getIdToken()) ?? null,
  origin: resolveDiagnosticsOrigin(useRuntimeConfig().public.diagnosticsIngestUrl),
}

const state = ref<StabilityState | null>(null)
const error = ref('')
const formOpen = ref(false)
const reason = ref('')
const task = ref('')
const saving = ref(false)

// Orologio proprio, rimesso a ogni lettura e azzeramento: il giorno non resta fermo a quando si
// e' aperto il Cockpit. "Aggiorna fotografia" (nuovo nowMs) rilegge anche gli azzeramenti.
const clock = ref(props.nowMs)
const progress = computed(() => state.value ? stabilityWeekDay(state.value.startedAt, clock.value) : null)
const lastReset = computed(() => state.value?.resets.at(-1) ?? null)
const dateLabel = (value: string) => new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })

async function load() {
  error.value = ''
  try {
    state.value = await loadStabilityState(deps)
    clock.value = Date.now()
  } catch (e) { error.value = (e as Error).message }
}

async function confirmReset() {
  if (!reason.value.trim()) return
  saving.value = true
  error.value = ''
  try {
    const at = Date.now()
    state.value = await resetStabilityWeek(deps, reason.value.trim(), task.value.trim(), localDay(at))
    clock.value = at
    formOpen.value = false
    reason.value = ''
    task.value = ''
  } catch (e) { error.value = (e as Error).message } finally { saving.value = false }
}

onMounted(load)
watch(() => props.nowMs, load)
</script>

<template>
  <section class="stability" aria-label="Settimana di stabilità">
    <div class="stability__main">
      <span>Settimana di stabilità</span>
      <strong v-if="progress">{{ progress.complete ? 'Completata' : `Giorno ${progress.day} di ${STABILITY_WEEK_DAYS}` }}</strong>
      <strong v-else>—</strong>
      <small v-if="state">dal {{ dateLabel(state.startedAt) }} · Develop e Produzione insieme · si azzera solo per un bug critico</small>
      <small v-if="lastReset" class="stability__reset">Ultimo azzeramento: {{ dateLabel(lastReset.at) }} — {{ lastReset.reason }}<template v-if="lastReset.task"> ({{ lastReset.task }})</template></small>
      <small v-if="error" class="stability__error" role="alert">{{ error }}</small>
    </div>
    <div class="stability__actions">
      <button v-if="!formOpen" type="button" class="stability__button" :disabled="!state" @click="formOpen = true">Azzera: bug critico</button>
      <form v-else class="stability__form" @submit.prevent="confirmReset">
        <label>Bug critico<input v-model="reason" maxlength="240" required placeholder="es. HUD bloccato senza recupero"></label>
        <label>Task<input v-model="task" maxlength="40" placeholder="PIP-…"></label>
        <div class="stability__row">
          <button type="submit" class="stability__button stability__button--danger" :disabled="saving || !reason.trim()">{{ saving ? 'Salvataggio…' : 'Azzera la settimana' }}</button>
          <button type="button" class="stability__button" @click="formOpen = false">Annulla</button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped lang="scss">
.stability { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 14px 16px; margin-bottom: 16px; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 10px; background: rgba(255, 255, 255, 0.03); }
.stability__main { display: flex; flex-direction: column; gap: 3px; }
.stability__main span { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: rgba(255, 255, 255, 0.6); }
.stability__main strong { font-size: 24px; }
.stability__main small { color: rgba(255, 255, 255, 0.6); font-size: 12px; }
.stability__reset { color: #fbbf24 !important; }
.stability__error { color: #f87171 !important; }
.stability__actions { display: flex; align-items: center; }
.stability__form { display: flex; flex-direction: column; gap: 6px; min-width: 260px; }
.stability__form label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: rgba(255, 255, 255, 0.7); }
.stability__form input { background: #0b0b0f; color: #fff; border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 6px; padding: 5px 8px; }
.stability__row { display: flex; gap: 6px; }
.stability__button { padding: 7px 12px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.25); background: rgba(255, 255, 255, 0.06); color: #fff; cursor: pointer; font-size: 13px; }
.stability__button:disabled { opacity: .5; cursor: default; }
.stability__button--danger { border-color: #ef4444; background: rgba(239, 68, 68, 0.18); }
</style>
