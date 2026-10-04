<script setup lang="ts">
import { computed } from 'vue'
import { gameLabel, gameLogo } from '~/services/telemetry/gameCatalog'
import { withBase } from 'ufo'
const props = defineProps<{ gameId: string }>()
const baseURL = typeof useRuntimeConfig === 'function' ? useRuntimeConfig().app.baseURL : '/'
const src = computed(() => { const logo = gameLogo(props.gameId); return logo ? withBase(logo, baseURL) : null })
</script>
<template>
  <img v-if="src" :src="src" :alt="gameLabel(gameId)" class="game-logo" width="200" height="70" />
  <span v-else>{{ gameLabel(gameId) }}</span>
</template>
<style scoped>
.game-logo { display: block; width: 100%; height: 100%; max-height: 70px; object-fit: contain; }
</style>
