<script setup lang="ts">
import { ref, useId } from 'vue'
import BaseInput from '~/components/ui/BaseInput.vue'
import AuthIcon from './AuthIcon.vue'
import { useI18n } from '~/i18n'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  modelValue: string
  label: string
  type?: 'text' | 'email' | 'password'
}>(), { type: 'text' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const visible = ref(false)
const fieldId = useId()
const { t } = useI18n()
</script>

<template>
  <div class="auth-field">
    <label :for="fieldId">{{ label }}</label>
    <div class="auth-field__control" :class="{ 'auth-field__control--password': props.type === 'password' }">
      <BaseInput :id="fieldId" v-bind="$attrs" :model-value="modelValue"
        :type="props.type === 'password' && visible ? 'text' : props.type"
        @update:model-value="emit('update:modelValue', $event)" />
      <button v-if="props.type === 'password'" type="button" class="auth-field__eye"
        :aria-label="visible ? t('auth.field.hidePassword') : t('auth.field.showPassword')" :aria-pressed="visible"
        :disabled="Boolean($attrs.disabled)" @click="visible = !visible">
        <AuthIcon name="eye" :hidden="visible" />
      </button>
    </div>
  </div>
</template>
