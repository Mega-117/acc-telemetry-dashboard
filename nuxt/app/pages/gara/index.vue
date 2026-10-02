<script setup lang="ts">
import { useGameContext } from '~/composables/useGameContext'
import GaraPage from '~/components/pages/GaraPage.vue'
</script>

<template>
  <PagesCommonGamePage v-if="useGameContext().consultedGame.value !== 'acc'" surface="gara" />
  <GaraPage v-else />
</template>
