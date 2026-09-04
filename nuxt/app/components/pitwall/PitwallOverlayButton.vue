<script setup lang="ts">
// "Apri Pitwall" nel pannello rapido Ctrl+K (PIP-362).
//
// L'overlay non ha un utente Firebase (PIP-317): non puo' aprire la gara da
// solo. Il clic rimbalza al processo main, che lo gira alla finestra
// principale della suite - l'unica che possiede la sessione - e lo stato
// torna indietro per la stessa strada, cosi' l'etichetta dice sempre la
// verita' e non cio' che il bottone spera.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PitwallIntentStatus } from '~/composables/usePitwallIntent'

const props = defineProps<{
  /** Il ponte Electron dell'overlay, o `null` nel browser. */
  api: Record<string, ((...args: never[]) => unknown) | undefined> | null
  selected?: boolean
}>()
defineEmits<{ focus: [] }>()

const status = ref<PitwallIntentStatus>({ state: 'off', roomId: null, reason: null, available: false })
const pending = ref(false)
let stopListening: (() => void) | null = null

const label = computed(() => {
  if (status.value.state === 'open') return 'Chiudi Pitwall'
  if (status.value.state === 'arming') return 'Pitwall: si apre in sessione'
  return 'Apri Pitwall'
})

const hint = computed(() => {
  if (!status.value.available) return 'Pitwall: si apre dall’app della suite.'
  if (status.value.state === 'open') return 'Pitwall: aperto, gli amici possono entrare.'
  if (status.value.state === 'arming') return `Pitwall: ${status.value.reason ?? 'si apre appena ACC è in sessione.'}`
  return 'Pitwall: chiuso.'
})

async function refresh() {
  const next = await (props.api?.trainingOverlayGetPitwallState as (() => Promise<PitwallIntentStatus | null>) | undefined)?.()
  if (next) status.value = next
}

async function toggle() {
  if (pending.value) return
  pending.value = true
  try {
    await (props.api?.trainingOverlayPitwallToggle as (() => Promise<unknown>) | undefined)?.()
  } finally {
    pending.value = false
  }
}

onMounted(() => {
  void refresh()
  const subscribe = props.api?.onPitwallIntentState as ((callback: (next: PitwallIntentStatus) => void) => () => void) | undefined
  stopListening = subscribe?.((next) => { status.value = next }) ?? null
})
onBeforeUnmount(() => { stopListening?.() })
</script>

<template>
  <button
    type="button"
    class="launcher-tool-button launcher-tool-button--training"
    :class="{ 'is-active': status.state === 'open', 'is-selected': selected }"
    :aria-pressed="status.state === 'open'"
    :aria-current="selected ? 'true' : undefined"
    :disabled="pending || !status.available"
    :title="hint"
    @focus="$emit('focus')"
    @click="toggle"
  >
    {{ label }}
  </button>
</template>
