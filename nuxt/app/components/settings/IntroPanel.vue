<script setup lang="ts">
// PIP-571: la voce di Impostazioni che riapre l'introduzione a 5 schede.
import { useOnboardingIntro } from '~/composables/useOnboardingIntro'

const intro = useOnboardingIntro()
</script>

<template>
  <section class="intro-panel" aria-labelledby="intro-title">
    <h2 id="intro-title">Introduzione</h2>
    <p>Le cinque schede che vedi al primo avvio: cosa fa Racer Core in pista, il pannello Ctrl+K, le automazioni, gli HUD e i comandi al volante.</p>
    <button class="rc-btn" type="button" @click="intro.open()">Rivedi l'introduzione</button>
  </section>
</template>

<style scoped lang="scss">
.intro-panel { max-width: 600px; }
h2 { margin: 0 0 12px; padding-left: 14px; border-left: 3px solid var(--racing-race); font-size: 20px; font-weight: 550; }
p { color: #aaa; line-height: 1.6; font-size: 13px; max-width: 520px; }
button { margin-top: 16px; }
</style>
