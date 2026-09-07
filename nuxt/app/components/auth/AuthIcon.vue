<script setup lang="ts">
defineProps<{ name: 'check' | 'mail' | 'arrow' | 'back' | 'eye'; hidden?: boolean }>()
</script>

<template>
  <svg class="auth-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <template v-if="name === 'check'">
        <circle cx="32" cy="32" r="28" />
        <path d="M49 10a28 28 0 0 1 8 34" stroke="#f40028" />
        <path d="m17 32 10 10 21-23" stroke-width="2.4" />
      </template>
      <template v-else-if="name === 'mail'">
        <path d="M9 25 32 9l23 16v32H9V25Z M9 25l23 18 23-18 M9 57l17-19 M55 57 38 38" />
        <path d="M14 29V5h36v24l-18 14-18-14Z" fill="#050505" />
        <path d="M23 16h18 M23 21h13" stroke="#f40028" />
      </template>
      <path v-else-if="name === 'arrow'" d="M10 32h42M38 18l14 14-14 14" />
      <path v-else-if="name === 'back'" d="M54 32H12m14-14L12 32l14 14" />
      <template v-else>
        <path d="M5 32S17 16 32 16s27 16 27 16-12 16-27 16S5 32 5 32Z" stroke-width="3" />
        <circle cx="32" cy="32" r="8" stroke-width="3" />
        <path v-if="hidden" d="m10 9 44 46" stroke-width="3" />
      </template>
    </g>
  </svg>
</template>
