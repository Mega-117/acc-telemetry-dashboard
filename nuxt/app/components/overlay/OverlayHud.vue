<script setup lang="ts">
/**
 * OverlayHud.vue
 * ==============
 * HUD di guida durante la sessione di allenamento.
 * Mostra: titolo step, timer, contatore giri, barra progresso.
 */
interface LiveLapState {
    currentLap: number | null
    lapValid: boolean | null
    lapsCompleted: number | null
    lapsValid: number | null
}

defineProps<{
    activeStep: { title: string }
    activeStepIndex: number
    totalSteps: number
    activeTask: string
    formattedTime: string
    liveLap: LiveLapState
    phase: string
    progressPercent: number
    hudTransitionKey: string
    isShortcutStopConfirmOpen: boolean
    isSaving: Boolean
    muted: boolean
    autoAdvanceRemainingSec: number | null
    autoAdvanceTotalSec: number
}>()

defineEmits<{
    'cancel-auto-advance': []
}>()
</script>

<template>
    <Transition name="hud-swap" mode="out-in">
        <div :key="hudTransitionKey" class="hud-swap-body">
            <div class="hud-focus-row">
                <div class="hud-copy">
                    <strong>{{ activeStep.title }}</strong>
                    <span>Step {{ activeStepIndex + 1 }}/{{ totalSteps }}</span>
                    <p class="hud-task">{{ activeTask }}</p>
                </div>
                <div class="hud-side">
                    <time class="hud-timer" aria-label="Tempo rimanente">{{ formattedTime }}</time>
                    <span v-if="muted" class="mute-chip" role="status" aria-label="Audio disattivato">MUTO</span>
                </div>
            </div>

            <div
                v-if="liveLap.currentLap !== null"
                class="lap-counter"
                :class="{ 'lap-counter--invalid': liveLap.lapValid === false }"
                aria-label="Contatore giri"
            >
                <span class="lap-counter-lap">LAP {{ liveLap.currentLap }}</span>
                <span
                    class="lap-counter-validity"
                    :class="liveLap.lapValid === false ? 'is-invalid' : 'is-valid'"
                >
                    {{ liveLap.lapValid === false ? '✗' : '✓' }}
                </span>
                <span v-if="liveLap.lapsCompleted !== null" class="lap-counter-stats">
                    {{ liveLap.lapsValid }}/{{ liveLap.lapsCompleted }} validi
                </span>
            </div>

            <Transition name="fade">
                <span v-if="isSaving" class="saving-indicator" aria-live="polite">salvataggio…</span>
            </Transition>

            <div
                v-if="phase === 'expired'"
                class="expiry-alert"
                role="status"
                aria-live="assertive"
            >
                <span>Pronto per lo step successivo</span>
                <button
                    v-if="autoAdvanceRemainingSec !== null"
                    type="button"
                    class="auto-advance-chip"
                    aria-label="Annulla avanzamento automatico"
                    @click="$emit('cancel-auto-advance')"
                >
                    Avanti tra {{ autoAdvanceRemainingSec }}s — clicca per restare
                </button>
                <span
                    v-if="autoAdvanceRemainingSec !== null"
                    class="auto-advance-track"
                    aria-hidden="true"
                >
                    <span :style="{ width: `${Math.max(0, Math.min(100, (autoAdvanceRemainingSec / Math.max(1, autoAdvanceTotalSec)) * 100))}%` }" />
                </span>
            </div>

            <div
                v-if="isShortcutStopConfirmOpen"
                class="shortcut-stop-confirm"
                role="status"
                aria-live="assertive"
            >
                <span>Conferma stop</span>
                <strong>Ctrl+N conferma - Ctrl+Alt+L/Esc annulla</strong>
            </div>

            <div v-if="phase !== 'expired'" class="progress-track" aria-hidden="true">
                <span :style="{ width: `${progressPercent}%` }" />
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.saving-indicator {
    display: inline-block;
    font-size: 0.7em;
    opacity: 0.55;
    letter-spacing: 0.03em;
    margin-top: 2px;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
