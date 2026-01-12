<script setup lang="ts">
// ============================================
// BaseInput - Input riutilizzabile
// ============================================

interface Props {
  modelValue: string
  type?: 'text' | 'email' | 'password'
  placeholder?: string
  autocomplete?: string
  maxlength?: number
  error?: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  placeholder: '',
  autocomplete: 'off',
  error: false,
  disabled: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const updateValue = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}
</script>

<template>
  <input
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :autocomplete="autocomplete"
    :maxlength="maxlength"
    :disabled="disabled"
    :class="['form-input', { 'form-input--error': error }]"
    @input="updateValue"
  />
</template>

<style lang="scss" scoped>
@use '~/assets/scss/variables' as *;
@use '~/assets/scss/mixins' as *;

.form-input {
  @include input-base;
  
  // === ERROR STATE ===
  &--error {
    border-color: var(--accent-danger);
    background: rgba(239, 68, 68, 0.05);
    
    &:focus {
      border-color: var(--accent-danger);
      box-shadow: 
        0 0 0 4px rgba(239, 68, 68, 0.1),
        0 4px 12px rgba(239, 68, 68, 0.2);
    }
  }
}
</style>
