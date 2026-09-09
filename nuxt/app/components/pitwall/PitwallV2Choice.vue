<script setup lang="ts">
defineProps<{ label: string, modelValue: boolean | null }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>
<template>
  <label class="v2-choice">
    <span>{{ label }}</span>
    <span class="choice-control">
      <span
        v-if="modelValue === null"
        class="unknown"
      >Da scegliere</span>
      <input
        type="checkbox"
        :checked="modelValue === true"
        :indeterminate="modelValue === null"
        :aria-checked="modelValue === null ? 'mixed' : modelValue"
        @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
      <button
        v-if="modelValue === null"
        type="button"
        @click="$emit('update:modelValue', false)"
      >No</button>
    </span>
  </label>
</template>
<style scoped>
.v2-choice, .choice-control { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.choice-control { min-width: 150px; justify-content: flex-end; }
input { accent-color: #ee5b22; }
button { color: inherit; background: #101820; border: 1px solid #3b4752; border-radius: 6px; padding: 4px 10px; }
.unknown { color: #e5b96e; font-size: 12px; }
</style>
