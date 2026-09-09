<script setup lang="ts">
import PitwallV2Panel from './PitwallV2Panel.vue'
import type { usePitwallRoom } from '~/composables/usePitwallRoom'
defineProps<{ port?: ReturnType<typeof usePitwallRoom> }>()
</script>
<template><PitwallV2Panel :port="port" /></template>
