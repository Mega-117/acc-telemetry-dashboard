<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '~/i18n'
import type { OwnerDataMaintenanceStatus } from '~/services/sync/ownerDataMaintenanceService'

const props = defineProps<{
  visible: boolean
  status: OwnerDataMaintenanceStatus
  progress: number
  message: string
  error?: string | null
  canRetry?: boolean
}>()

const { t } = useI18n()

const emit = defineEmits<{
  close: []
  retry: []
}>()

const canClose = computed(() => props.status === 'completed' || props.status === 'failed' || props.status === 'skipped')
const normalizedProgress = computed(() => Math.max(0, Math.min(100, Math.round(props.progress || 0))))
const bannerType = computed(() => {
  if (props.status === 'failed') return 'error'
  if (props.status === 'completed' || props.status === 'skipped') return 'success'
  return 'info'
})

function close() {
  if (canClose.value) emit('close')
}
</script>

<template>
  <!-- In the top-right message column (AppNotifications' slot), in the site's style. -->
  <Teleport defer to="#app-toast-slot">
    <Transition name="maintenance">
      <div v-if="visible" :class="['maintenance-notification', bannerType]" @click="close">
        <div class="notification-header">
          <span class="notification-title">{{ status === 'failed' ? t('game.maintenance.failed') : t('game.maintenance.title') }}</span>
          <button v-if="canClose" class="notification-close" :aria-label="t('game.maintenance.close')" @click.stop="close">×</button>
        </div>
        <p class="notification-message">{{ error || message || t('game.maintenance.running') }}</p>
        <button v-if="status === 'failed' && canRetry" class="rc-btn notification-retry" @click.stop="emit('retry')">{{ t('game.maintenance.retry') }}</button>
        <div v-if="status !== 'failed'" class="notification-progress">
          <div class="progress-bar"><div class="progress-fill" :style="{ width: `${normalizedProgress}%` }"></div></div>
          <span class="progress-label">{{ normalizedProgress }}%</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
@use '~/assets/scss/racing-toast' as toast;

.maintenance-notification {
  @include toast.toast;
  @include toast.toast-tones;
  display: grid;
  gap: 6px;
  width: 360px;
  max-width: 100%;
  cursor: default;
  &.success, &.error { cursor: pointer; }
}

.notification-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.notification-title { font: italic 700 14px/1.2 'Racer Display', sans-serif; text-transform: uppercase; letter-spacing: .02em; }
.notification-message { margin: 0; font-size: 12px; line-height: 1.35; color: #ffffffbf; }
.notification-close { border: 0; background: none; color: #ffffffb3; font-size: 18px; line-height: 1; cursor: pointer; &:hover { color: #fff; } }
.notification-retry { justify-self: start; min-height: 34px; padding-inline: 16px; }
.notification-progress { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
.progress-bar { flex: 1; height: 3px; background: #ffffff1f; }
.progress-fill { height: 100%; background: var(--toast-tone); box-shadow: 0 0 6px var(--toast-tone); transition: width .25s ease; }
.progress-label { font: 600 11px 'Inter', sans-serif; font-variant-numeric: tabular-nums; color: #ffffffcc; }

@include toast.toast-motion(maintenance);
</style>
