<script setup lang="ts">
import { onMounted, ref } from 'vue'
import RacingSwitch from '~/components/ui/RacingSwitch.vue'
import { useI18n } from '~/i18n'

type StartupState = { supported: boolean; enabled: boolean }
type StartupApi = {
  windowsStartupGet?: () => Promise<StartupState>
  windowsStartupSet?: (enabled: boolean) => Promise<StartupState>
}
const { t } = useI18n()
const state = ref<StartupState | null>(null)
const busy = ref(false)
const error = ref('')
const saved = ref(false)
const api = (): StartupApi | undefined => (window as Window & { electronAPI?: StartupApi }).electronAPI

async function load() {
  busy.value = true
  error.value = ''
  try {
    const bridge = api()
    if (!bridge?.windowsStartupGet || !bridge.windowsStartupSet) {
      error.value = t('startup.needsUpdate')
      return
    }
    state.value = await bridge.windowsStartupGet()
  } catch {
    error.value = t('startup.readError')
  } finally { busy.value = false }
}

async function change(enabled: boolean) {
  if (busy.value || !state.value?.supported) return
  busy.value = true
  saved.value = false
  error.value = ''
  try {
    const bridge = api()
    if (!bridge?.windowsStartupSet) throw new Error('unavailable')
    state.value = await bridge.windowsStartupSet(enabled)
    saved.value = true
  } catch {
    error.value = t('startup.writeError')
    try { state.value = await api()?.windowsStartupGet?.() ?? state.value } catch { /* keep last confirmed state */ }
  } finally { busy.value = false }
}

onMounted(load)
</script>

<template>
  <section class="startup-panel" aria-labelledby="startup-title" :aria-busy="busy">
    <h2 id="startup-title">{{ t('startup.title') }}</h2>
    <div class="startup-option">
      <span>
        <strong>{{ t('startup.withWindows') }}</strong>
        <small>{{ t('startup.withWindowsHint') }}</small>
      </span>
      <RacingSwitch :label="t('startup.withWindows')" :model-value="state?.enabled === true"
        :disabled="busy || !state?.supported" @update:model-value="change" />
    </div>
    <p v-if="state && !state.supported" class="startup-note">{{ t('startup.installedOnly') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="saved" role="status">{{ t('startup.saved') }}</p>
    <p v-else-if="busy" role="status">{{ t('startup.updating') }}</p>
    <button v-if="error" class="rc-btn" type="button" :disabled="busy" @click="load">{{ t('startup.retry') }}</button>
  </section>
</template>

<style scoped lang="scss">
.startup-panel { max-width: 600px; }
h2 { margin: 0 0 12px; padding-left: 14px; border-left: 3px solid var(--racing-race); font-size: 20px; font-weight: 550; }
p,small { color: #aaa; line-height: 1.6; font-size: 13px; }
.startup-option { display: flex; align-items: center; gap: 24px; margin-top: 16px; padding: 16px 0; border-top: 1px solid #ffffff35; max-width: 560px; }
strong,small { display: block; } strong { font-size: 14px; font-weight: 550; } small { margin-top: 8px; max-width: 480px; }
.startup-option > span { flex: 1; }
[role='alert'] { color: #ff7188; } [role='status'] { color: #21ff83; }
</style>
