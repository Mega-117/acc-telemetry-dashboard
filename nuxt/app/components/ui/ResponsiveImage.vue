<script setup lang="ts">
import { computed } from 'vue'
import { responsiveImage } from '~/utils/responsiveImage'

const props = withDefaults(defineProps<{ src: string; alt: string; sizes?: string; loading?: 'lazy' | 'eager' }>(), {
  sizes: '100vw', loading: 'lazy',
})
const config = useRuntimeConfig()
const attributes = computed(() => responsiveImage(props.src, config.app.baseURL, props.sizes))
</script>

<template>
  <img v-bind="attributes" :alt="alt" :loading="loading" />
</template>
