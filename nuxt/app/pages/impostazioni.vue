<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useWheelInputBridge } from '~/composables/useWheelInputBridge'

definePageMeta({ layout: 'dashboard' })

const router = useRouter()
const ready = ref(false)
const bridge = useWheelInputBridge()

onMounted(async () => {
  const api = (window as Window & {
    electronAPI?: { localIdentityRole?: string; controlsGetState?: () => Promise<unknown> }
  }).electronAPI
  if (!api?.controlsGetState || api.localIdentityRole !== 'primary') {
    await router.replace('/panoramica')
    return
  }
  await bridge.start()
  ready.value = true
})
</script>

<template>
  <div v-if="ready" class="settings-page">
    <header class="settings-page__title">
      <p>ACC SUITE</p>
      <h1>Impostazioni</h1>
      <span>Personalizza i controlli della tua postazione.</span>
    </header>
    <div class="settings-shell">
      <aside aria-label="Sezioni impostazioni">
        <button type="button" class="is-active">
          <span aria-hidden="true">⌘</span>
          Comandi
        </button>
      </aside>
      <main>
        <SettingsCommandBindingsPanel />
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings-page { max-width: 1400px; margin: 0 auto; padding: 36px 28px 64px; color: #fff; }
.settings-page__title { margin-bottom: 26px; } .settings-page__title p { margin: 0 0 7px; color: #ff4d3d; font-size: 11px; font-weight: 800; letter-spacing: 1.8px; }
.settings-page__title h1 { margin: 0 0 8px; font-size: 34px; } .settings-page__title span { color: #8f8f9d; }
.settings-shell { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 22px; align-items: start; }
aside { background: #14141b; border: 1px solid rgba(255,255,255,.07); border-radius: 14px; padding: 9px; }
aside button { display: flex; gap: 10px; align-items: center; width: 100%; padding: 12px 14px; border: 0; border-radius: 9px; background: transparent; color: #a0a0ac; font-weight: 700; }
aside button.is-active { color: #fff; background: rgba(255,77,61,.13); }
@media (max-width: 780px) { .settings-shell { grid-template-columns: 1fr; } }
</style>
