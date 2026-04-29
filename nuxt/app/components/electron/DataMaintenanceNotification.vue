<script setup lang="ts">
import { computed } from 'vue'
import type { OwnerDataMaintenanceStatus } from '~/services/sync/ownerDataMaintenanceService'

const props = defineProps<{
  visible: boolean
  status: OwnerDataMaintenanceStatus
  progress: number
  message: string
  error?: string | null
}>()

const emit = defineEmits<{
  close: []
}>()

const canClose = computed(() => props.status === 'completed' || props.status === 'failed' || props.status === 'skipped')
const normalizedProgress = computed(() => Math.max(0, Math.min(100, Math.round(props.progress || 0))))
const bannerType = computed(() => {
  if (props.status === 'failed') return 'error'
  if (props.status === 'completed' || props.status === 'skipped') return 'success'
  return 'running'
})

function close() {
  if (canClose.value) emit('close')
}
</script>

<template>
  <Transition name="slide">
    <div v-if="visible" :class="['maintenance-notification', bannerType]" @click="close">
      <div class="notification-header">
        <span class="notification-title">Aggiornamento dati</span>
        <button v-if="canClose" class="notification-close" @click.stop="close">x</button>
      </div>
      <p class="notification-message">{{ error || message || 'Operazione in corso...' }}</p>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${normalizedProgress}%` }"></div>
      </div>
      <span class="progress-label">{{ normalizedProgress }}%</span>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
.maintenance-notification {
  position: fixed;
  top: 86px;
  right: 12px;
  width: min(360px, calc(100vw - 24px));
  padding: 14px;
  border-radius: 10px;
  color: #fff;
  z-index: 10000;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  cursor: default;

  &.running {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.92), rgba(37, 99, 235, 0.92));
    border: 1px solid rgba(147, 197, 253, 0.45);
  }

  &.success {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.92), rgba(22, 163, 74, 0.92));
    border: 1px solid rgba(134, 239, 172, 0.45);
    cursor: pointer;
  }

  &.error {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.92), rgba(185, 28, 28, 0.92));
    border: 1px solid rgba(252, 165, 165, 0.45);
    cursor: pointer;
  }
}

.notification-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.notification-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.notification-message {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.9);
}

.notification-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.progress-bar {
  overflow: hidden;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.92);
  transition: width 0.25s ease;
}

.progress-label {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  text-align: right;
  color: rgba(255, 255, 255, 0.75);
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
