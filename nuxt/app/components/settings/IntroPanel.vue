<script setup lang="ts">
// PIP-571: la voce di Impostazioni che riapre l'introduzione a 5 schede.
import { useOnboardingIntro } from '~/composables/useOnboardingIntro'
import { useI18n } from '~/i18n'

const intro = useOnboardingIntro()
const { t } = useI18n()
</script>

<template>
  <section class="intro-panel" aria-labelledby="intro-title">
    <h2 id="intro-title">{{ t('introPanel.title') }}</h2>
    <p>{{ t('introPanel.text') }}</p>
    <button class="rc-btn" type="button" @click="intro.open()">{{ t('introPanel.replay') }}</button>
  </section>
</template>

<style scoped lang="scss">
.intro-panel { max-width: 600px; }
h2 { margin: 0 0 12px; padding-left: 14px; border-left: 3px solid var(--racing-race); font-size: 20px; font-weight: 550; }
p { color: #aaa; line-height: 1.6; font-size: 13px; max-width: 520px; }
button { margin-top: 16px; }
</style>
