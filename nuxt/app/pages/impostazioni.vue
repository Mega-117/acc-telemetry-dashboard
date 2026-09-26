<script setup lang="ts">
import { Keyboard, Power } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import { useWheelInputBridge } from '~/composables/useWheelInputBridge'
definePageMeta({ layout: 'dashboard' })

const router = useRouter()
const ready = ref(false)
const section = ref<'commands' | 'startup'>('commands')
const bridge = useWheelInputBridge()

onBeforeRouteLeave(async () => { await bridge.finishConfiguration() })

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

      <h1>Impostazioni</h1>
      <span>Personalizza il programma e i controlli della tua postazione.</span>
    </header>
    <div class="settings-shell">
      <aside aria-label="Sezioni impostazioni">
        <button type="button" :class="{ 'is-active': section === 'commands' }" :aria-pressed="section === 'commands'" @click="section = 'commands'">
          <Keyboard :size="22" aria-hidden="true" />
          Comandi
        </button>
        <button type="button" :class="{ 'is-active': section === 'startup' }" :aria-pressed="section === 'startup'" @click="section = 'startup'">
          <Power :size="22" aria-hidden="true" />
          Avvio
        </button>
      </aside>
      <main>
        <SettingsCommandBindingsPanel v-show="section === 'commands'" />
        <SettingsStartupPanel v-if="section === 'startup'" />
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as controls;
.settings-page { max-width: var(--app-content-max-width); margin: 0 auto; padding: var(--app-content-top-space) 24px 64px; color: #fff; box-sizing: border-box; }
.settings-page__title { margin-bottom: 28px; }
.settings-page__title h1 { margin: 0 0 8px; font-size: 34px; font-weight: 650; }
.settings-page__title span { color: #aaa; font-size: 14px; }
.settings-shell { @include controls.panel; display: grid; grid-template-columns: 230px minmax(0,1fr); gap: 28px; padding: 24px; align-items: stretch; }
aside { border-right: 1px solid #ffffff35; padding-right: 24px; }
aside button { @include controls.action; display: flex; align-items: center; gap: 16px; width: 100%; min-height: 56px; margin-bottom: 12px; background: transparent; text-align: left; }
aside button::after { opacity: 0; }
aside button.is-active { color: #fff; background: linear-gradient(110deg,#ffffff20,#ffffff05); box-shadow: inset 4px 0 #fff; }
aside button.is-active::after { opacity: .5; }
main { min-width: 0; }
@media(max-width:1000px) { .settings-shell { grid-template-columns: 180px minmax(0,1fr); gap: 20px; padding: 20px; } }
@media(max-width:780px) { .settings-shell { grid-template-columns: 1fr; } aside { display: flex; gap: 12px; border-right: 0; border-bottom: 1px solid #ffffff35; padding: 0 0 12px; } aside button { margin: 0; } }
.settings-page { @include controls.tokens; }
.settings-page__title h1 { @include controls.title; }.settings-shell aside button { @include controls.navigation; }
.settings-shell { max-width: 1220px; }
.settings-shell:has(.startup-panel) { max-width: 940px; }
</style>
