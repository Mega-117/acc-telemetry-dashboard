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
import { useI18n } from '~/i18n'

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

const { t } = useI18n()

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
            :aria-label="t('hudSetup.training.typeAria')"
        >
            <span>{{ t('hudSetup.training.training') }}</span>
            <button
                type="button"
                class="training-current"
                        data-overlay-wheel-action="training-picker"
                :aria-expanded="isTrainingPickerOpen"
                :aria-label="t('hudSetup.training.openPicker')"
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
                        :data-overlay-wheel-action="`training-${training.id}`"
                        type="button"
                        :class="[
                            'training-option',
                            `training-option--${training.tone}`,
                            { 'is-active': selectedTrainingId === training.id }
                        ]"
                        :style="trainingOptionStyle(training)"
                        :aria-label="t('hudSetup.training.select', { label: training.label })"
                        :aria-pressed="selectedTrainingId === training.id"
                        @click="emit('select-training', training.id)"
                    >
                        <strong>{{ training.label }}</strong>
                    </button>
                </div>
            </div>
        </div>

        <!-- Duration selector -->
        <div class="duration-row" :aria-label="t('hudSetup.training.durationAria')">
            <span>{{ t('hudSetup.training.duration') }}</span>
            <div class="duration-options">
                <button
                    v-for="mode in selectedModeList"
                    :key="mode.id"
                        :data-overlay-wheel-action="`duration-${mode.id}`"
                    type="button"
                    :class="{ 'is-active': selectedModeId === mode.id }"
                    :aria-label="t('hudSetup.training.durationOf', { title: mode.title })"
                    :aria-pressed="selectedModeId === mode.id"
                    @click="emit('select-mode', mode.id)"
                >
                    {{ mode.title }}
                </button>
            </div>
        </div>

        <!-- Training plan preview -->
        <div class="training-plan-preview" :aria-label="t('hudSetup.training.plan')">
            <div class="training-plan-head">
                <span>{{ t('hudSetup.training.plan') }}</span>
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
            :aria-label="t('hudSetup.training.settingsAria')"
        >
            <button
                type="button"
                class="settings-toggle"
                        data-overlay-wheel-action="settings"
                :aria-expanded="isSettingsOpen"
                :aria-label="t('hudSetup.training.openSettings')"
                @click="emit('toggle-settings')"
            >
                <span>{{ t('hudSetup.training.settings') }}</span>
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
                                :aria-label="soundEnabled ? t('hudSetup.training.audioOnAria') : t('hudSetup.training.audioOffAria')"
                                :aria-pressed="soundEnabled"
                                data-overlay-wheel-action="sound"
                                @click="emit('toggle-sound')"
                            >
                                <span>{{ t('hudSetup.training.audio') }}</span>
                                <strong :class="{ 'is-active': soundEnabled }">
                                    {{ soundEnabled ? t('hudSetup.training.on') : t('hudSetup.training.off') }}
                                </strong>
                            </button>

                            <button
                                type="button"
                                class="setting-row setting-row--button"
                                :aria-label="autoDimDuringRun ? t('hudSetup.training.autoDimOnAria') : t('hudSetup.training.autoDimOffAria')"
                                :aria-pressed="autoDimDuringRun"
                                @click="emit('toggle-auto-dim')"
                        data-overlay-wheel-action="auto-dim"
                            >
                                <span>{{ t('hudSetup.training.autoDim') }}</span>
                                <strong :class="{ 'is-active': autoDimDuringRun }">
                                    {{ autoDimDuringRun ? t('hudSetup.training.on') : t('hudSetup.training.off') }}
                                </strong>
                            </button>

                            <button
                                type="button"
                                class="setting-row setting-row--button"
                                :aria-label="autoAdvanceStep ? t('hudSetup.training.autoAdvanceOnAria') : t('hudSetup.training.autoAdvanceOffAria')"
                                :aria-pressed="autoAdvanceStep"
                                @click="emit('toggle-auto-advance')"
                        data-overlay-wheel-action="auto-advance"
                            >
                                <span>{{ t('hudSetup.training.autoAdvance') }}</span>
                                <strong :class="{ 'is-active': autoAdvanceStep }">
                                    {{ autoAdvanceStep ? t('hudSetup.training.on') : t('hudSetup.training.off') }}
                                </strong>
                            </button>

                            <div
                                v-if="autoAdvanceStep"
                                class="setting-row auto-advance-seconds"
                                :aria-label="t('hudSetup.training.countdownAria')"
                            >
                                <span>{{ t('hudSetup.training.countdown') }}</span>
                                <span class="seconds-options" role="group">
                                    <button
                                        v-for="s in autoAdvanceSecondsOptions"
                                        :key="s"
                        :data-overlay-wheel-action="`countdown-${s}`"
                                        type="button"
                                        :class="{ 'is-active': autoAdvanceSeconds === s }"
                                        :aria-label="t('hudSetup.training.countdownSeconds', { seconds: s })"
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
                                    {{ t('hudSetup.training.shortcutNote') }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
