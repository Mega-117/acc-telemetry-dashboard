<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div
    class="scroll-area"
    data-page-scroll
    role="region"
    :aria-label="label"
    tabindex="0"
  >
    <slot></slot>
  </div>
</template>

<style scoped>
.scroll-area { scrollbar-width: thin; scrollbar-gutter: stable; }
</style>
