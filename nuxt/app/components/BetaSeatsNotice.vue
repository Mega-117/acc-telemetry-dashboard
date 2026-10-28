<script setup lang="ts">
// Beta seats (28/10): shown only when this account found no free seat. Local features keep working.
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useI18n } from '~/i18n'

const { betaSeat } = useFirebaseAuth()
const { t } = useI18n()
</script>

<template>
  <aside v-if="betaSeat === 'full'" class="beta-seats-notice" role="status">{{ t('common.betaSeatsFull') }}</aside>
</template>

<style scoped>
.beta-seats-notice { position: relative; z-index: 50; flex: none; padding: 8px 20px; color: #f5e6c9; background: #332a1e; border-bottom: 1px solid #796344; font-size: 13px; }
</style>
