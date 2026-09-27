<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useOverlayRegionApi } from '~/composables/useOverlayRegionApi'

const props = defineProps<{ overlayId: string }>()
const getApi = useOverlayRegionApi()
const active = ref(false)
const available = ref(false)
const pending = ref(false)
const error = ref('')
let off: (() => void) | undefined
let disposed = false
let revision = 0
onMounted(async () => {
  const api = getApi()
  available.value = typeof api?.hudOverlaySetPlacement === 'function'
  off = api?.onHudOverlayPlacement?.((value: boolean) => {
    revision += 1
    active.value = value === true
  })
  const initialRevision = revision
  try {
    const value = await api?.hudOverlayGetPlacement?.(props.overlayId)
    if (!disposed && revision === initialRevision) active.value = value === true
  } catch { /* The next placement event reconciles state. */ }
})
onBeforeUnmount(() => { disposed = true; off?.() })

async function toggle() {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    active.value = await getApi()?.hudOverlaySetPlacement(props.overlayId, !active.value) === true
  } catch {
    error.value = 'Posizione non salvata. Riprova a bloccare il pannello.'
  } finally { pending.value = false }
}
</script>

<template>
  <button v-if="available" type="button" class="overlay-placement-lock" data-overlay-interactive
    :class="{ 'is-unlocked': active, 'has-error': error }" :aria-pressed="active" :disabled="pending"
    :aria-label="active ? 'Blocca posizione overlay' : 'Sblocca posizione overlay'"
    :title="error || (active ? 'Trascina il pannello. Clicca per bloccare; blocco automatico dopo 60 s di inattività.' : 'Sblocca e sposta questo overlay')"
    @pointerdown.stop @click.stop="toggle">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path :d="active ? 'M8 10V6a4 4 0 0 1 8 0' : 'M8 10V6a4 4 0 0 1 8 0v4'" />
      <path d="M12 14v3" />
    </svg>
    <span v-if="error" class="overlay-placement-lock__error" role="alert">{{ error }}</span>
  </button>
</template>

<style>
/* Keep a small hit target registered while locked: the native pointer arbiter
   discovers hover even when the rest of the overlay passes clicks to ACC. */
.overlay-placement-lock {
  position: absolute; top: 5px; left: 5px; z-index: 100;
  display: grid; place-items: center; width: 28px; height: 28px; padding: 0;
  border: 1px solid #6b7078; border-radius: 5px; background: #101317f2;
  color: #d8dde5; opacity: 0; transition: opacity 120ms ease;
  cursor: pointer; -webkit-app-region: no-drag; pointer-events: auto;
}
*:hover > .overlay-placement-lock,
.overlay-pointer-surface-hovered .overlay-placement-lock { opacity: 1; }
.overlay-placement-lock.is-unlocked { color: #37eea0; border-color: #37eea0; }
.overlay-placement-lock.has-error { color: #ff7373; border-color: #ff7373; }
.overlay-placement-lock__error {
  position: absolute; top: 32px; left: 0; width: 185px; padding: 8px;
  background: #18191e; color: #ffaaaa; font-size: 12px; line-height: 1.3;
  pointer-events: none; text-align: left;
}
@media (prefers-reduced-motion: reduce) { .overlay-placement-lock { transition: none; } }
</style>
