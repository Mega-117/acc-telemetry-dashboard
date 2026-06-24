<script setup lang="ts">
/**
 * OverlaySelectSetup.vue
 * =======================
 * Pannello selezione allenamento nell'overlay training.
 * Gestisce: scelta allenamento, durata, piano chip e impostazioni.
 *
 * Tutti i dati arrivano via props e gli eventi risalgono tramite emit.
 */
import type {
    TrainingOverlayDurationModeId,
    TrainingOverlayId,
    TrainingOverlayMode,
    TrainingOverlayTraining,
} from '~/config/trainingOverlayCatalog'
import { autoAdvanceSecondsOptions } from '~/composables/useOverlaySettings'

interface PlanChip {
    id: string
    type: string
    label: string
    durationLabel: string
    title: string
    repeat?: string | null
}

interface Shortcut {
    label: string
    value: string
}


const props = defineProps<{
    selectedTraining: TrainingOverlayTraining
    selectedTrainingId: TrainingOverlayId
    trainingOverlayTrainingList: TrainingOverlayTraining[]
    selectedModeList: TrainingOverlayMode[]
    selectedModeId: TrainingOverlayDurationModeId
    selectedMode: TrainingOverlayMode
    selectedPlanChips: PlanChip[]
    soundEnabled: boolean
    autoDimDuringRun: boolean
    overlayShortcuts: Shortcut[]
    isTrainingPickerOpen: boolean
    isSettingsOpen: boolean
    autoAdvanceStep: boolean
    autoAdvanceSeconds: number
}>()

const emit = defineEmits<{
    'select-training': [id: TrainingOverlayId]
    'select-mode': [id: TrainingOverlayDurationModeId]
    'toggle-training-picker': []
    'toggle-settings': []
    'toggle-sound': []
    'toggle-auto-dim': []
    'toggle-auto-advance': []
    'select-auto-advance-seconds': [seconds: number]
}>()

function trainingOptionStyle(training: TrainingOverlayTraining) {
    return {
        '--accent-color': training.accent,
        '--accent-end-color': training.accentEnd ?? training.accent,
    }
}
</script>

<template>
    <div class="setup-stack">
        <!-- Training picker accordion -->
        <div
            class="training-picker"
            :class="{ 'is-open': isTrainingPickerOpen }"
            aria-label="Tipo allenamento"
        >
            <span>Allenamento</span>
            <button
                type="button"
                class="training-current"
                :aria-expanded="isTrainingPickerOpen"
                aria-label="Apri selezione tipo allenamento"
                @click="emit('toggle-training-picker')"
            >
                <span>
                    <strong>{{ selectedTraining.label }}</strong>
                </span>
                <span class="accordion-chevron" aria-hidden="true" />
            </button>
            <div
                class="accordion-panel training-options-panel"
                :class="{ 'is-open': isTrainingPickerOpen }"
                :aria-hidden="!isTrainingPickerOpen"
                :inert="!isTrainingPickerOpen"
            >
                <div class="accordion-content training-options">
                    <button
                        v-for="training in trainingOverlayTrainingList"
                        :key="training.id"
                        type="button"
                        :class="[
                            'training-option',
                            `training-option--${training.tone}`,
                            { 'is-active': selectedTrainingId === training.id }
                        ]"
                        :style="trainingOptionStyle(training)"
                        :aria-label="`Seleziona allenamento ${training.label}`"
                        :aria-pressed="selectedTrainingId === training.id"
                        @click="emit('select-training', training.id)"
                    >
                        <strong>{{ training.label }}</strong>
                    </button>
                </div>
            </div>
        </div>

        <!-- Duration selector -->
        <div class="duration-row" aria-label="Durata allenamento">
            <span>Durata</span>
            <div class="duration-options">
                <button
                    v-for="mode in selectedModeList"
                    :key="mode.id"
                    type="button"
                    :class="{ 'is-active': selectedModeId === mode.id }"
                    :aria-label="`Durata ${mode.title}`"
                    :aria-pressed="selectedModeId === mode.id"
                    @click="emit('select-mode', mode.id)"
                >
                    {{ mode.title }}
                </button>
            </div>
        </div>

        <!-- Training plan preview -->
        <div class="training-plan-preview" aria-label="Piano allenamento">
            <div class="training-plan-head">
                <span>Piano allenamento</span>
                <strong>{{ selectedMode.title }}</strong>
            </div>
            <div class="training-plan-chips">
                <span
                    v-for="segment in selectedPlanChips"
                    :key="segment.id"
                    class="plan-chip"
                    :class="[
                        `plan-chip--${segment.type}`,
                        { 'has-repeat': segment.repeat }
                    ]"
                    :title="segment.title"
                >
                    <small v-if="segment.repeat">{{ segment.repeat }}</small>
                    <em>{{ segment.label }}</em>
                    <strong>{{ segment.durationLabel }}</strong>
                </span>
            </div>
        </div>

        <!-- Settings accordion -->
        <div
            class="settings-panel"
            :class="{ 'is-open': isSettingsOpen }"
            aria-label="Impostazioni overlay"
        >
            <button
                type="button"
                class="settings-toggle"
                :aria-expanded="isSettingsOpen"
                aria-label="Apri pannello impostazioni"
                @click="emit('toggle-settings')"
            >
                <span>Impostazioni</span>
                <span class="accordion-chevron" aria-hidden="true" />
            </button>

            <div
                class="accordion-panel settings-body-panel"
                :class="{ 'is-open': isSettingsOpen }"
                :aria-hidden="!isSettingsOpen"
                :inert="!isSettingsOpen"
            >
                <div class="accordion-content settings-body">
                    <div class="settings-columns">
                        <div class="settings-list">
                            <button
                                type="button"
                                class="setting-row setting-row--button"
                                :aria-label="`Audio ${soundEnabled ? 'attivo' : 'disattivo'} — clicca per cambiare`"
                                :aria-pressed="soundEnabled"
                                @click="emit('toggle-sound')"
                            >
                                <span>Audio</span>
                                <strong :class="{ 'is-active': soundEnabled }">
                                    {{ soundEnabled ? 'On' : 'Off' }}
                                </strong>
                            </button>

                            <button
                                type="button"
                                class="setting-row setting-row--button"
                                :aria-label="`Opacita ridotta in guida ${autoDimDuringRun ? 'attiva' : 'disattiva'} — clicca per cambiare`"
                                :aria-pressed="autoDimDuringRun"
                                @click="emit('toggle-auto-dim')"
                            >
                                <span>Opacit&agrave; ridotta in guida</span>
                                <strong :class="{ 'is-active': autoDimDuringRun }">
                                    {{ autoDimDuringRun ? 'On' : 'Off' }}
                                </strong>
                            </button>

                            <button
                                type="button"
                                class="setting-row setting-row--button"
                                :aria-label="`Avanzamento automatico a fine step ${autoAdvanceStep ? 'attivo' : 'disattivo'} — clicca per cambiare`"
                                :aria-pressed="autoAdvanceStep"
                                @click="emit('toggle-auto-advance')"
                            >
                                <span>Avanza da solo a fine step</span>
                                <strong :class="{ 'is-active': autoAdvanceStep }">
                                    {{ autoAdvanceStep ? 'On' : 'Off' }}
                                </strong>
                            </button>

                            <div
                                v-if="autoAdvanceStep"
                                class="setting-row auto-advance-seconds"
                                aria-label="Durata countdown avanzamento automatico"
                            >
                                <span>Countdown avanzamento</span>
                                <span class="seconds-options" role="group">
                                    <button
                                        v-for="s in autoAdvanceSecondsOptions"
                                        :key="s"
                                        type="button"
                                        :class="{ 'is-active': autoAdvanceSeconds === s }"
                                        :aria-label="`Countdown ${s} secondi`"
                                        :aria-pressed="autoAdvanceSeconds === s"
                                        @click="emit('select-auto-advance-seconds', s)"
                                    >
                                        {{ s }}s
                                    </button>
                                </span>
                            </div>

                            <div class="shortcut-list">
                                <div
                                    v-for="shortcut in overlayShortcuts"
                                    :key="shortcut.label"
                                    class="shortcut-row"
                                >
                                    <span>{{ shortcut.label }}</span>
                                    <strong>{{ shortcut.value }}</strong>
                                </div>
                                <p class="shortcut-note">
                                    Per volante o button box (es. Fanatec via SimHub), mappa i bottoni
                                    su questi tasti: bastano pressioni singole, niente hold.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
