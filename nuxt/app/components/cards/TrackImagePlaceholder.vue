<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from '~/i18n'

defineProps<{ name: string }>()
const id = useId()
const { t } = useI18n()
</script>

<template>
  <svg viewBox="0 0 512 512" role="img" :aria-label="`${name} — ${t('tracks.noImage')}`">
    <defs>
      <linearGradient :id="`${id}-background`" x2="1" y2="1">
        <stop stop-color="#11161c" />
        <stop offset="1" stop-color="#050608" />
      </linearGradient>
      <pattern :id="`${id}-lines`" width="72" height="72" patternUnits="userSpaceOnUse">
        <path d="M0 72 72 0" stroke="#fff" stroke-opacity=".035" />
      </pattern>
    </defs>
    <path :fill="`url(#${id}-background)`" d="M0 0h512v512H0z" />
    <path :fill="`url(#${id}-lines)`" d="M0 0h512v512H0z" />
    <g fill="none" stroke="#8896a5" stroke-width="3" stroke-linejoin="round">
      <path d="M208 295V171c38-22 59 22 99 0v78c-40 22-61-22-99 0" />
      <path d="M211 191c36-17 57 22 93 0M211 211c36-17 57 22 93 0M211 231c36-17 57 22 93 0" opacity=".35" />
    </g>
    <path d="M224 327h64" stroke="#ff0024" stroke-width="3" />
    <foreignObject x="32" y="348" width="448" height="120">
      <div xmlns="http://www.w3.org/1999/xhtml" class="placeholder-name">{{ name }}</div>
    </foreignObject>
  </svg>
</template>

<style scoped>
.placeholder-name { color: #adb6c0; font: 22px/1.4 Arial, sans-serif; letter-spacing: 3px; text-align: center; text-transform: uppercase; overflow-wrap: anywhere; }
</style>
