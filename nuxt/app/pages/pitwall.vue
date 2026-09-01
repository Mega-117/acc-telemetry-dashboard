<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import PitwallPage from '~/components/pages/PitwallPage.vue'
import PitwallConcept from '~/components/pitwall/concept/PitwallConcept.vue'
import { usePitwallConceptMode } from '~/composables/usePitwallConceptMode'

definePageMeta({
  layout: 'dashboard'
})

const { active: conceptActive, setActive } = usePitwallConceptMode()

onBeforeUnmount(() => setActive(false))
</script>

<template>
  <div class="pitwall-route">
    <div class="pitwall-view-switch" aria-label="Seleziona esperienza Pit Wall">
      <span>Vista</span>
      <button :class="{ active: !conceptActive }" @click="setActive(false)">Classica</button>
      <button :class="{ active: conceptActive }" @click="setActive(true)">Concept</button>
    </div>
    <PitwallPage v-if="!conceptActive" />
    <PitwallConcept v-else />
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;
.pitwall-route { position: relative; }
.pitwall-view-switch { position: relative; z-index: 2; display: flex; align-items: center; gap: 3px; width: max-content; height: 34px; margin: 6px 20px 0 auto; padding: 3px; border: 1px solid rgba(255,255,255,.12); border-radius: 9px; background: rgba(10,10,15,.92); box-shadow: 0 6px 18px rgba(0,0,0,.2); }
.pitwall-view-switch span { padding: 0 9px; color: $text-muted; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.pitwall-view-switch button { height: 26px; padding: 0 11px; border: 0; border-radius: 6px; background: transparent; color: $text-secondary; font-size: 12px; font-weight: 700; cursor: pointer; }
.pitwall-view-switch button:focus-visible { outline: 2px solid $racing-orange; outline-offset: 2px; }
.pitwall-view-switch button.active { background: rgba($racing-orange,.16); color: #fff; box-shadow: inset 0 0 0 1px rgba($racing-orange,.55); }
@media(max-width:1180px) { .pitwall-view-switch { margin-right: 16px; } }
@media(max-width:760px) { .pitwall-view-switch { margin-right: 10px; } .pitwall-view-switch span { display: none; } }
</style>
