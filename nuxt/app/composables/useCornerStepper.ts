// PIP-635: in Telemetria, curva precedente / successiva (Track Titan, VRS) con le frecce e i tasti ← →, Esc per il
// giro intero; e la curva sotto il cursore per l'etichetta della distanza.
// 05/11 (user): the same arrows step the sectors when a sector is open.
import { computed, onBeforeUnmount, onMounted, type Ref } from 'vue'
import { cornerAt, stepCorner, type Corner } from '~/services/telemetry/lapAnalysis'

export function useCornerStepper(o: {
  active: () => boolean
  corners: Ref<Corner[]>
  /** How many sectors the strip has (0 when the lap has none). */
  sectorCount?: Ref<number>
  selectedCorner: Ref<number | null>
  selectedSector: Ref<number | null>
  zoomRange: Ref<[number, number] | null>
  cursor: Ref<number | null>
  wholeLap: () => void
}) {
  /** An open sector or corner: the arrows have something to step (a zoom dragged inside it is dropped). */
  const canStep = computed(() => o.selectedSector.value !== null || o.selectedCorner.value !== null)
  function goStep(step: 1 | -1) {
    o.zoomRange.value = null
    if (o.selectedSector.value !== null) {
      // Sectors are 0-based, the stepper counts from 1.
      const next = stepCorner(o.selectedSector.value + 1, o.sectorCount?.value ?? 0, step)
      if (next !== null) o.selectedSector.value = next - 1
      return
    }
    const next = o.selectedCorner.value === null ? null : stepCorner(o.selectedCorner.value, o.corners.value.length, step)
    if (next === null) return
    o.selectedSector.value = null
    o.selectedCorner.value = next
  }
  function onKey(event: KeyboardEvent) {
    // A key already handled by a control (a lap menu closing on Escape) is not a page shortcut.
    if (!o.active() || event.defaultPrevented) return
    if (event.key === 'Escape') { o.wholeLap(); return }
    if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || !canStep.value) return
    // Le frecce restano ai campi e agli switcher quando sono loro ad avere il fuoco.
    if ((event.target as HTMLElement | null)?.closest?.("input, select, textarea, [role='tablist'], [role='dialog']")) return
    event.preventDefault()
    goStep(event.key === 'ArrowRight' ? 1 : -1)
  }
  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
  // "C6 · 1,2 km" sotto il cursore: niente sui rettilinei.
  const cursorCorner = computed(() => { const c = cornerAt(o.corners.value, o.cursor.value); return c ? `Seg ${c.number}` : null })
  return { goStep, canStep, cursorCorner }
}
