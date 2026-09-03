<script setup lang="ts">
// La Pit Wall: la vista nuova e' quella di default, cablata allo store vero
// fornito dall'app. "Legacy" e' la pagina precedente, intatta. Con `?demo=1`
// (solo strumenti dev) la vista nuova gira sulle fixture del prototipo.
import PitwallPage from '~/components/pages/PitwallPage.vue'
import PitwallConcept from '~/components/pitwall/concept/PitwallConcept.vue'
import { usePitwallConceptMode } from '~/composables/usePitwallConceptMode'
import { usePitwallConceptState } from '~/composables/usePitwallConceptState'
import { providePitwallStore } from '~/composables/usePitwallStore'
import { canUseDevTools } from '~/utils/devToolsAccess'

definePageMeta({
  layout: 'dashboard'
})

const route = useRoute()
const { legacy, setLegacy } = usePitwallConceptMode()

const demo = computed(() => route.query.demo === '1' && canUseDevTools())
if (demo.value) providePitwallStore(usePitwallConceptState())
</script>

<template>
  <div class="pitwall-route">
    <div class="pitwall-view-switch" aria-label="Seleziona vista Pit Wall">
      <span>Vista</span>
      <button :class="{ active: !legacy }" @click="setLegacy(false)">Pit Wall</button>
      <button :class="{ active: legacy }" @click="setLegacy(true)">Legacy</button>
      <em v-if="demo" class="pitwall-view-switch__demo">demo</em>
    </div>
    <PitwallPage v-if="legacy" />
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
.pitwall-view-switch__demo { padding: 0 8px; color: $racing-orange; font-size: 10px; font-style: normal; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
@media(max-width:1180px) { .pitwall-view-switch { margin-right: 16px; } }
@media(max-width:760px) { .pitwall-view-switch { margin-right: 10px; } .pitwall-view-switch span { display: none; } }
</style>
