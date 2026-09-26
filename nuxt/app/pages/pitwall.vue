<script setup lang="ts">
// La Pit Wall: la vista nuova e' quella di default, cablata allo store vero
// fornito dall'app. "Legacy" e' la pagina precedente, intatta. Con `?demo=1`
// (solo strumenti dev) la vista nuova gira sulle fixture del prototipo.
import PitwallV4Local from '~/components/pitwall/PitwallV4Local.vue'
import PitwallPage from '~/components/pages/PitwallPage.vue'
import PitwallConcept from '~/components/pitwall/concept/PitwallConcept.vue'
import { usePitwallConceptMode } from '~/composables/usePitwallConceptMode'
import { usePitwallConceptState } from '~/composables/usePitwallConceptState'
import { providePitwallApplicationMethod } from '~/composables/usePitwallApplicationMethod'
import { providePitwallStore } from '~/composables/usePitwallStore'
import { canUseDevTools, isDevToolsHost } from '~/utils/devToolsAccess'
import { onMounted } from 'vue'

definePageMeta({
  layout: 'dashboard'
})

const v4Local = ref(false)
const localViewsAvailable = ref(false)
onMounted(() => { localViewsAvailable.value = isDevToolsHost() })
const route = useRoute()
const { legacy, setLegacy } = usePitwallConceptMode()

const demo = computed(() => route.query.demo === '1' && canUseDevTools())
providePitwallApplicationMethod()
if (demo.value) providePitwallStore(usePitwallConceptState())
</script>

<template>
  <div class="pitwall-route">
    <PitwallV4Local v-if="localViewsAvailable && v4Local" />
    <PitwallPage v-else-if="localViewsAvailable && legacy" />
    <PitwallConcept v-else />
    <details v-if="localViewsAvailable" class="pitwall-dev-views">
      <summary>Viste di sviluppo</summary>
    <div class="pitwall-view-switch" aria-label="Seleziona vista Pit Wall">
      <span>Vista</span>
      <button :class="{ active: !v4Local && !legacy }" @click="v4Local = false; setLegacy(false)">Pit Wall</button>
      <button :class="{ active: !v4Local && legacy }" @click="v4Local = false; setLegacy(true)">Legacy</button>
      <button :class="{ active: v4Local }" @click="v4Local = true">V4 locale</button>
      <em v-if="demo" class="pitwall-view-switch__demo">demo</em>
    </div>
    </details>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;
.pitwall-route { position: relative; }
.pitwall-dev-views { max-width: var(--app-content-max-width, 1400px); margin: 0 auto; padding: 0 24px 16px; color: $text-muted; font-size: 11px; }
.pitwall-dev-views summary { cursor: pointer; width: max-content; padding: 8px 0; }
.pitwall-view-switch { position: relative; z-index: 2; display: flex; align-items: center; gap: 3px; width: max-content; height: 34px; margin: 4px 0 0; padding: 3px; border: 1px solid rgba(255,255,255,.12); border-radius: 0; background: rgba(10,10,15,.92); box-shadow: 0 6px 18px rgba(0,0,0,.2); }
.pitwall-view-switch span { padding: 0 9px; color: $text-muted; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.pitwall-view-switch button { height: 26px; padding: 0 11px; border: 0; border-radius: 0; background: transparent; color: $text-secondary; font-size: 12px; font-weight: 700; cursor: pointer; }
.pitwall-view-switch button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.pitwall-view-switch button.active { background: rgba(255,255,255,.08); color: #fff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.35); }
.pitwall-view-switch__demo { padding: 0 8px; color: $racing-orange; font-size: 10px; font-style: normal; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
@media(max-width:1180px) { .pitwall-view-switch { margin-right: 16px; } }
@media(max-width:760px) { .pitwall-view-switch { margin-right: 10px; } .pitwall-view-switch span { display: none; } }
</style>
