<script setup lang="ts">
import PitwallV3Panel from './PitwallV3Panel.vue'
import type { usePitwallRoom } from '~/composables/usePitwallRoom'
defineProps<{ port?: ReturnType<typeof usePitwallRoom> }>()
</script>
<template><PitwallV3Panel :port="port" /></template>
