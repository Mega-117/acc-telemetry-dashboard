<script setup lang="ts">
// SyncNotification - Shows sync results banner
import { ref, watch, computed } from 'vue'

interface SyncResult {
  status: 'created' | 'updated' | 'unchanged' | 'skipped' | 'error'
  fileName: string
  reason?: string
  error?: string
}

const props = defineProps<{
  results: SyncResult[]
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const isVisible = ref(false)

// Auto-hide after 5 seconds
let hideTimeout: ReturnType<typeof setTimeout> | null = null

watch(() => props.visible, (newVal) => {
  isVisible.value = newVal
  if (newVal && hideTimeout) clearTimeout(hideTimeout)
  if (newVal) {
    hideTimeout = setTimeout(() => {
      isVisible.value = false
      emit('close')
    }, 5000)
  }
})

// Summary stats
const stats = computed(() => {
  const created = props.results.filter(r => r.status === 'created').length
  const updated = props.results.filter(r => r.status === 'updated').length
  const skipped = props.results.filter(r => r.status === 'skipped').length
  const errors = props.results.filter(r => r.status === 'error').length
  return { created, updated, skipped, errors, total: props.results.length }
})

// Banner type
const bannerType = computed(() => {
  if (stats.value.errors > 0) return 'error'
  if (stats.value.created > 0 || stats.value.updated > 0) return 'success'
  if (stats.value.total === 0) return 'info'
  return 'info'
})

// Message
const message = computed(() => {
  const s = stats.value
  if (s.total === 0) return 'Nessun file da sincronizzare'
  if (s.errors > 0) return `${s.errors} errori durante la sincronizzazione`
  if (s.created > 0 && s.updated > 0) return `${s.created} nuovi, ${s.updated} aggiornati`
  if (s.created > 0) return `${s.created} sessioni sincronizzate`
  if (s.updated > 0) return `${s.updated} sessioni aggiornate`
  if (s.skipped > 0) return `${s.skipped} file saltati (già sincronizzati o di altri utenti)`
  return 'Sincronizzazione completata'
})

const close = () => {
  isVisible.value = false
  emit('close')
}
</script>

<template>
  <Transition name="slide">
    <div v-if="isVisible" :class="['sync-notification', bannerType]" @click="close">
      <div class="notification-icon">
        <svg v-if="bannerType === 'success'" width="16" height="16" viewBox="0 0 16 16">
          <path d="M6 10.8l-3-3L1.6 9.2l4.4 4.4 9-9L13.6 3 6 10.8z" fill="currentColor"/>
        </svg>
        <svg v-else-if="bannerType === 'error'" width="16" height="16" viewBox="0 0 16 16">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a1 1 0 110-2 1 1 0 010 2zM9 7H7V4h2v3z" fill="currentColor"/>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 16 16">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm1 10H7V9h2v2zm0-3H7V4h2v4z" fill="currentColor"/>
        </svg>
      </div>
      <span class="notification-message">{{ message }}</span>
      <button class="notification-close" @click.stop="close">×</button>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
.sync-notification {
  position: fixed;
  top: 44px; // Below titlebar
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  cursor: pointer;
  z-index: 10000;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  
  &.success {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.9), rgba(22, 163, 74, 0.9));
    border: 1px solid rgba(34, 197, 94, 0.5);
  }
  
  &.error {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.9));
    border: 1px solid rgba(239, 68, 68, 0.5);
  }
  
  &.info {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(37, 99, 235, 0.9));
    border: 1px solid rgba(59, 130, 246, 0.5);
  }
}

.notification-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.notification-message {
  flex: 1;
}

.notification-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  
  &:hover {
    color: #fff;
  }
}

// Transition
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
