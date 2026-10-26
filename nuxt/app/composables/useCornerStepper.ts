// PIP-635: in Telemetria, curva precedente / successiva (Track Titan, VRS) con le frecce accanto al nome
// e i tasti ← →, Esc per il giro intero; e la curva sotto il cursore per l'etichetta della distanza.
import { computed, onBeforeUnmount, onMounted, type Ref } from 'vue'
import { cornerAt, stepCorner, type Corner } from '~/services/telemetry/lapAnalysis'

export function useCornerStepper(o: {
  active: () => boolean
  corners: Ref<Corner[]>
  selectedCorner: Ref<number | null>
  selectedSector: Ref<number | null>
  zoomRange: Ref<[number, number] | null>
  cursor: Ref<number | null>
  wholeLap: () => void
}) {
  function goCorner(step: 1 | -1) {
    const next = o.selectedCorner.value === null ? null : stepCorner(o.selectedCorner.value, o.corners.value.length, step)
    if (next === null) return
    o.selectedSector.value = null
    o.selectedCorner.value = next
    o.zoomRange.value = null
  }
  function onKey(event: KeyboardEvent) {
    // A key already handled by a control (a lap menu closing on Escape) is not a page shortcut.
    if (!o.active() || event.defaultPrevented) return
    if (event.key === 'Escape') { o.wholeLap(); return }
    if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || o.selectedCorner.value === null) return
    // Le frecce restano ai campi e agli switcher quando sono loro ad avere il fuoco.
    if ((event.target as HTMLElement | null)?.closest?.("input, select, textarea, [role='tablist']")) return
    event.preventDefault()
    goCorner(event.key === 'ArrowRight' ? 1 : -1)
  }
  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
  // "C6 · 1,2 km" sotto il cursore: niente sui rettilinei.
  const cursorCorner = computed(() => { const c = cornerAt(o.corners.value, o.cursor.value); return c ? `C${c.number}` : null })
  return { goCorner, cursorCorner }
}
