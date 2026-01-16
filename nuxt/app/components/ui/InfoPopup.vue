<script setup lang="ts">
/**
 * InfoPopup - Reusable info icon with popup tooltip
 * Used to provide contextual help throughout the dashboard
 */

interface Props {
  title: string
  position?: 'left' | 'right'
  size?: 'small' | 'normal'
}

const props = withDefaults(defineProps<Props>(), {
  position: 'left',
  size: 'normal'
})

const isOpen = ref(false)

// Close popup when clicking outside
const popupRef = ref<HTMLElement | null>(null)

const handleClickOutside = (e: MouseEvent) => {
  if (popupRef.value && !popupRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <span ref="popupRef" class="info-popup-wrapper">
    <span 
      class="info-icon" 
      :class="{ 'info-icon--small': size === 'small' }"
      @click.stop="isOpen = !isOpen"
    >
      <svg :width="size === 'small' ? 12 : 14" :height="size === 'small' ? 12 : 14" viewBox="0 0 512 512">
        <circle cx="256" cy="256" r="256" fill="currentColor"/>
        <text x="256" y="380" text-anchor="middle" font-size="340" font-weight="700" font-family="Arial" fill="#1a1a2e">i</text>
      </svg>
    </span>
    <Transition name="popup-fade">
      <div 
        v-if="isOpen" 
        class="info-popup"
        :class="{ 'info-popup-right': position === 'right' }"
      >
        <strong>{{ title }}</strong><br>
        <slot />
        <span class="info-close" @click.stop="isOpen = false">✕</span>
      </div>
    </Transition>
  </span>
</template>

<style lang="scss" scoped>
@use '~/assets/scss/variables' as *;

.info-popup-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  margin-left: 6px;
  transition: color 0.2s, transform 0.2s;
  vertical-align: middle;
  
  svg {
    display: block;
  }
  
  &:hover {
    color: rgba(255, 255, 255, 0.9);
    transform: scale(1.1);
  }
  
  &--small {
    margin-left: 4px;
    svg { width: 12px; height: 12px; }
  }
}

.info-popup {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  width: 280px;
  padding: 12px 14px;
  margin-top: 8px;
  background: linear-gradient(145deg, #1e1e2a, #15151d);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  font-size: 11px;
  font-weight: 400;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.8);
  text-transform: none;
  letter-spacing: 0;
  
  strong {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    color: #fff;
  }
  
  :deep(b) {
    color: $accent-info;
  }
  
  :deep(code) {
    display: block;
    margin-top: 6px;
    padding: 6px 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: $accent-success;
  }
}

.info-popup-right {
  left: auto;
  right: 0;
}

.info-close {
  position: absolute;
  top: 8px;
  right: 10px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  
  &:hover {
    color: rgba(255, 255, 255, 0.8);
  }
}

// Transition
.popup-fade-enter-active,
.popup-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.popup-fade-enter-from,
.popup-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
