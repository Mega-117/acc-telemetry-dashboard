<script setup lang="ts">
// ============================================
// BaseButton - Pulsante riutilizzabile
// ============================================

interface Props {
  variant?: 'primary' | 'secondary' | 'link'
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  loading: false,
  disabled: false,
  type: 'button'
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const handleClick = (event: MouseEvent) => {
  if (!props.loading && !props.disabled) {
    emit('click', event)
  }
}
</script>

<template>
  <button
    :type="type"
    :class="[
      'btn',
      `btn--${variant}`,
      { 'btn--loading': loading }
    ]"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <slot />
  </button>
</template>

<style lang="scss" scoped>
@use '~/assets/scss/variables' as *;
@use '~/assets/scss/mixins' as *;

.btn {
  @include button-base;
  
  // === PRIMARY ===
  &--primary {
    background: var(--gradient-primary);
    color: white;
    box-shadow: 0 4px 16px rgba(var(--theme-accent-rgb), 0.3);
    
    &:hover:not(:disabled) {
      box-shadow: 0 6px 24px rgba(var(--theme-accent-rgb), 0.4);
    }
    
    &:active:not(:disabled) {
      transform: translateY(0);
    }
  }
  
  // === SECONDARY ===
  &--secondary {
    background: transparent;
    color: var(--theme-accent);
    border: 2px solid var(--theme-accent);
    
    &:hover:not(:disabled) {
      background: rgba(var(--theme-accent-rgb), 0.1);
    }
  }
  
  // === LINK ===
  &--link {
    background: none;
    padding: $spacing-sm 0;
    color: var(--theme-accent);
    text-decoration: underline;
    text-transform: none;
    letter-spacing: normal;
    
    &:hover:not(:disabled) {
      color: var(--theme-accent-light);
      text-shadow: 0 0 8px rgba(var(--theme-accent-rgb), 0.5);
    }
  }
  
  // === LOADING STATE ===
  &--loading {
    pointer-events: none;
    opacity: 0.7;
    position: relative;
    
    &::after {
      content: '';
      position: absolute;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  }
}

@keyframes spin {
  to { transform: translateY(-50%) rotate(360deg); }
}
</style>
