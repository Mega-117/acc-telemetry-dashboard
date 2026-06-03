import { computed, type ComputedRef, type Ref } from 'vue'
import {
  resolveTrainingOverlayModeId,
  trainingOverlayTrainingList,
  type TrainingOverlayDurationModeId,
  type TrainingOverlayStep,
  type TrainingOverlayTraining,
  type TrainingOverlayId,
} from '~/config/trainingOverlayCatalog'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PlanPreviewChip {
  id: string; label: string; durationLabel: string
  type: TrainingOverlayStep['type']; title: string; repeat?: string
}

// ─── Composable ───────────────────────────────────────────────────────────────
/**
 * @description Manages training + mode selection: computed properties derived from
 * selectedTrainingId / selectedModeId and the selectTraining / selectMode interaction functions.
 * selectedTrainingId and selectedModeId are owned by the page and passed in so they can be shared
 * with useOverlaySettings (savePreferences) without introducing circular dependencies.
 * @param selectedTrainingId - Ref holding the active training overlay id.
 * @param selectedModeId - Ref holding the active duration mode id.
 * @param isActiveSession - Computed flag; selection changes are blocked during an active session.
 * @param closeShortcutStopConfirm - Dismisses the stop-confirm modal on training change.
 * @param isTrainingPickerOpen - Ref controlling the training picker modal visibility.
 * @param activeStepIndex - Ref for the current step index within the running training plan.
 * @param remainingMs - Ref tracking milliseconds remaining in the current step.
 * @param savePreferences - Persists the new selection to the Electron API.
 * @param scheduleOverlaySizeSync - Requests a size recalculation after the selection changes layout.
 * @returns Object with selectedTraining, selectedMode, planPreviewChips computeds and selectTraining / selectMode functions.
 */
export function useTrainingSelection(
  selectedTrainingId: Ref<TrainingOverlayId>,
  selectedModeId: Ref<TrainingOverlayDurationModeId>,
  isActiveSession: ComputedRef<boolean>,
  closeShortcutStopConfirm: () => void,
  isTrainingPickerOpen: Ref<boolean>,
  activeStepIndex: Ref<number>,
  remainingMs: Ref<number>,
  savePreferences: () => Promise<void>,
  scheduleOverlaySizeSync: () => void,
) {
  const selectedTraining = computed<TrainingOverlayTraining>(() =>
    trainingOverlayTrainingList.find(t => t.id === selectedTrainingId.value) || trainingOverlayTrainingList[0]!
  )
  const selectedMode = computed(() => selectedTraining.value.modes[selectedModeId.value])
  const selectedModeList = computed(() => Object.values(selectedTraining.value.modes))

  const selectedPlanChips = computed<PlanPreviewChip[]>(() => {
    if (selectedTraining.value.id === 'qualifying' && selectedMode.value.id === 'full60') {
      return [
        { id: 'qualy-warmup', label: 'Warm-up', durationLabel: '10m', type: 'warmup', title: 'Warm-up - 10 min' },
        { id: 'qualy-repeat', label: 'Qualifica + pausa', durationLabel: '10m + 2m', type: 'stint', repeat: 'x4', title: '4 blocchi: Qualifica 10 min + Pausa 2 min' },
        { id: 'qualy-recap', label: 'Recap', durationLabel: '2m', type: 'recap', title: 'Recap - 2 min' },
      ] satisfies PlanPreviewChip[]
    }
    if (selectedTraining.value.id === 'tracktitan_input' && selectedMode.value.id === 'full60') {
      return [
        { id: 'track-run', label: 'Run iniziale', durationLabel: '10m', type: 'run', title: 'Run iniziale - 10 min' },
        { id: 'track-repeat', label: 'Review + focus', durationLabel: '5m + 10m', type: 'focusRun', repeat: 'x3', title: '3 blocchi: Review 5 min + Run focus 10 min' },
        { id: 'track-recap', label: 'Recap', durationLabel: '5m', type: 'recap', title: 'Recap - 5 min' },
      ] satisfies PlanPreviewChip[]
    }
    return selectedMode.value.steps.map(step => ({
      id: step.id, label: step.title, durationLabel: `${step.durationMinutes}m`,
      type: step.type, title: `${step.title} - ${step.durationMinutes} min`,
    }))
  })

  function selectTraining(trainingId: TrainingOverlayId) {
    if (isActiveSession.value) return
    closeShortcutStopConfirm(); selectedTrainingId.value = trainingId; isTrainingPickerOpen.value = false
    selectedModeId.value = resolveTrainingOverlayModeId(selectedModeId.value)
    activeStepIndex.value = 0; remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
    void savePreferences(); scheduleOverlaySizeSync()
  }

  function selectMode(modeId: TrainingOverlayDurationModeId) {
    if (isActiveSession.value) return
    closeShortcutStopConfirm(); selectedModeId.value = modeId; activeStepIndex.value = 0
    remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000; void savePreferences()
  }

  return {
    selectedTraining, selectedMode, selectedModeList, selectedPlanChips,
    selectTraining, selectMode,
  }
}
