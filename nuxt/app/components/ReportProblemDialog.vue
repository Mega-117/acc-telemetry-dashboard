<script setup lang="ts">
// PIP-661: "Segnala problema". In the desktop program the description goes with a diagnostics package sent
// privately; the answer is a support code to paste on Discord (#bug). In a browser there is no package to
// send: the dialog says so and points to Discord.
import { ref } from 'vue'
import { X } from '@lucide/vue'
import { useAppNotifications } from '~/composables/useAppNotifications'
import { useI18n } from '~/i18n'

const emit = defineEmits<{ close: [] }>()
type Bridge = { reportProblem?: (note: string) => Promise<{ ok: boolean, code?: string, delivered?: boolean, reason?: string }> }
const bridge = typeof window === 'undefined' ? undefined : (window as Window & { electronAPI?: Bridge }).electronAPI
const inDesktopApp = typeof bridge?.reportProblem === 'function'
const note = ref(''), busy = ref(false), error = ref('')
const result = ref<{ code: string, delivered: boolean } | null>(null)
const { push } = useAppNotifications()
const { t } = useI18n()

async function send() {
  if (!inDesktopApp || busy.value) return
  busy.value = true; error.value = ''
  try {
    const answer = await bridge!.reportProblem!(note.value.trim())
    if (answer.ok && answer.code) result.value = { code: answer.code, delivered: answer.delivered === true }
    else error.value = answer.reason || t('privacy.report.sendFailed')
  } catch { error.value = t('privacy.report.sendFailed') }
  finally { busy.value = false }
}

async function copyCode() {
  if (!result.value) return
  try { await navigator.clipboard.writeText(result.value.code); push(t('privacy.report.copied'), 'success') }
  catch { push(t('privacy.report.copyFailed'), 'error') }
}
</script>

<template>
  <Teleport to="body">
    <div class="rp-backdrop" @click.self="emit('close')">
      <div class="rp-modal" role="dialog" aria-modal="true" aria-labelledby="rp-title" @keydown.esc="emit('close')">
        <header>
          <div><span class="eyebrow">{{ t('privacy.report.eyebrow') }}</span><h2 id="rp-title">{{ t('privacy.report.title') }}</h2></div>
          <button type="button" class="modal-close" :aria-label="t('privacy.report.close')" @click="emit('close')"><X :size="20" aria-hidden="true" /></button>
        </header>

        <template v-if="!inDesktopApp">
          <p>{{ t('privacy.report.browserOnly') }}</p>
        </template>
        <template v-else-if="result">
          <p>{{ result.delivered ? t('privacy.report.received') : t('privacy.report.queued') }}</p>
          <div class="rp-code"><code class="rc-selectable">{{ result.code }}</code><button type="button" class="rc-btn rc-btn--compact" @click="copyCode">{{ t('privacy.report.copy') }}</button></div>
          <p class="rp-help">{{ t('privacy.report.help') }}</p>
        </template>
        <template v-else>
          <p>{{ t('privacy.report.intro') }}</p>
          <label class="rp-field"><span>{{ t('privacy.report.question') }}</span><textarea v-model="note" rows="4" maxlength="240" :placeholder="t('privacy.report.placeholder')" :disabled="busy" /></label>
          <p v-if="error" class="rp-error" role="alert">{{ error }}</p>
          <footer><button type="button" class="rc-btn rc-btn--primary" :disabled="busy" @click="send">{{ busy ? t('privacy.report.sending') : t('privacy.report.send') }}</button></footer>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rp-backdrop { position: fixed; inset: 0; z-index: 3200; display: grid; place-items: center; padding: 24px; background: #000000a6; backdrop-filter: blur(10px); }
:global(body:has(.electron-titlebar)) .rp-backdrop { top: 36px; }
.rp-modal { width: min(560px, 100%); padding: 26px; border: 1px solid var(--rc-section-line); background: #0a0a0da6; color: #fff; }
header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.eyebrow { display: block; margin-bottom: 6px; color: #aaa; font-size: 11px; letter-spacing: 1.5px; font-weight: 500; text-transform: uppercase; }
h2 { margin: 0; font: italic 700 24px/1.2 'Racer Display', sans-serif; text-transform: uppercase; }
p { color: #c9c9d1; font-size: 13.5px; line-height: 1.55; }
.modal-close { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border: 1px solid var(--rc-section-line); background: transparent; color: #ffffffc7; cursor: pointer; }
.modal-close:hover { color: #fff; border-color: #ffffffa6; background: #ffffff12; }
.rp-field { display: grid; gap: 6px; margin-top: 8px; }
.rp-field span { color: #ccc; font-size: 12px; }
.rp-field textarea { padding: 10px 12px; border: 1px solid #ffffff30; border-radius: 0; background: #ffffff04; color: #fff; font: 14px/1.5 'Inter', sans-serif; resize: vertical; }
.rp-field textarea:focus { border-color: #ff0024; outline: 1px solid #ff0024; outline-offset: 1px; }
.rp-code { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid #ffffff30; background: #ffffff06; }
.rp-code code { flex: 1; min-width: 0; overflow-wrap: anywhere; font: 600 14px 'JetBrains Mono', monospace; }
.rp-help { color: #a9a9b3; font-size: 13px; }
.rp-error { padding: 8px 12px; border-left: 2px solid #ff0024; background: #ff00240a; color: #ff9aaa; }
footer { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
