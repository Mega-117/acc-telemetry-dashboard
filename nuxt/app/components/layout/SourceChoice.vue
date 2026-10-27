<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { gameLabel } from '~/services/telemetry/gameCatalog'
import { useI18n } from '~/i18n'

const { t } = useI18n()

interface Choice { generation: string; available: string[]; observed_at_ms: number }
interface Bridge {
  getSourceSelection?: () => Promise<unknown>
  selectSource?: (choice: { generation: string; gameId: string }) => Promise<{ ok: boolean }>
}
const pending = ref<Choice | null>(null)
const busy = ref(false)
const error = ref('')
let timer: ReturnType<typeof setInterval> | undefined
let stopped = false
let refreshing = false
const bridge = () => typeof window === 'undefined' ? undefined : (window as unknown as { electronAPI?: Bridge }).electronAPI
async function refresh() {
  if (pending.value && Date.now() - pending.value.observed_at_ms > 3000) pending.value = null
  if (refreshing || stopped) return
  refreshing = true
  try {
    const raw = await bridge()?.getSourceSelection?.() as Record<string, unknown> | null | undefined
    if (stopped) return
    const age = Date.now() - Number(raw?.observed_at_ms)
    pending.value = raw?.status === 'choice-required' && typeof raw.generation === 'string'
      && Number.isFinite(age) && age >= -1000 && age <= 3000
      && Array.isArray(raw.available) && raw.available.length === 2
      && raw.available.includes('acc') && raw.available.includes('evo')
      ? { generation: raw.generation, available: ['acc', 'evo'], observed_at_ms: Number(raw.observed_at_ms) } : null
  } catch { if (!stopped) pending.value = null }
  finally { refreshing = false }
}
async function choose(gameId: string) {
  const choice = pending.value
  if (!choice || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await bridge()?.selectSource?.({ generation: choice.generation, gameId })
    if (stopped) return
    if (result?.ok) pending.value = null
    else error.value = t('game.source.changed')
  } catch { if (!stopped) error.value = t('game.source.failed') }
  finally { busy.value = false; if (!stopped) await refresh() }
}
onMounted(() => { void refresh(); timer = setInterval(() => { void refresh() }, 1000) })
onBeforeUnmount(() => { stopped = true; if (timer) clearInterval(timer) })
</script>

<template>
  <section v-if="pending" class="source-choice" :aria-label="t('game.source.aria')" role="alert">
    <strong>{{ t('game.source.title') }}</strong>
    <p>{{ t('game.source.body') }}</p>
    <div>
      <button v-for="game in pending.available" :key="game" type="button" :disabled="busy" @click="choose(game)">{{ gameLabel(game) }}</button>
    </div>
    <p v-if="error" role="status">{{ error }}</p>
  </section>
</template>

<style scoped>
.source-choice { position: fixed; top: 180px; left: 50%; transform: translateX(-50%); z-index: 1000; width: min(360px, calc(100vw - 48px)); padding: 18px; color: var(--rc-text, #f2f3f5); background: var(--rc-surface, #1d2027); border: 1px solid var(--rc-line, #ffffff29); border-radius: 6px; box-shadow: 0 8px 24px #0008; }
p { margin: 8px 0; font-size: 13px; line-height: 1.5; }
.source-choice div { display: flex; gap: 8px; }
button { padding: 8px 14px; background: transparent; border: 1px solid currentColor; border-radius: 3px; color: inherit; cursor: pointer; }
button:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
button:disabled { opacity: .5; cursor: wait; }
</style>
