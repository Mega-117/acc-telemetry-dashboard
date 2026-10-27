<script setup lang="ts">
// PIP-661: "Segnala problema". In the desktop program the description goes with a diagnostics package sent
// privately. Decision 27/10: the pilot writes, presses Invia and sees "Inviato, grazie" (no code: the admin
// finds the report by pilot and time). The program applies the anti-spam limits (3 a day, 10 minutes apart,
// no duplicate text) and says so kindly. In a browser there is no package to send: it points to Discord.
import { computed, ref } from 'vue'
import { X } from '@lucide/vue'
import { useI18n } from '~/i18n'
import type { TranslationKey } from '~/i18n/types'

const emit = defineEmits<{ close: [] }>()
type Answer = { ok: boolean, delivered?: boolean, error?: string, limit?: 'day' | 'wait' | 'duplicate', waitMinutes?: number, reason?: string }
type Bridge = { reportProblem?: (note: string) => Promise<Answer> }
const bridge = typeof window === 'undefined' ? undefined : (window as Window & { electronAPI?: Bridge }).electronAPI
const inDesktopApp = typeof bridge?.reportProblem === 'function'
const note = ref(''), busy = ref(false), error = ref('')
/** The final message: sent, waiting on the PC, or a limit reached (nothing was sent). */
const outcome = ref('')
const { t } = useI18n()
const canSend = computed(() => !busy.value && note.value.trim().length > 0)

// Short codes from the program, translated here; an unknown code falls back to a generic error.
const ERRORS: Record<string, TranslationKey> = {
  'not-ready': 'privacy.report.notReady', busy: 'privacy.report.busy', 'bundle-cap': 'privacy.report.bundleCap',
  'not-built': 'privacy.report.sendFailed', rejected: 'privacy.report.rejected',
}

function limitText(answer: Answer): string {
  if (answer.limit === 'wait') return t('privacy.report.limitWait', { minutes: Math.max(1, answer.waitMinutes ?? 10) })
  return answer.limit === 'duplicate' ? t('privacy.report.limitDuplicate') : t('privacy.report.limitDay')
}

async function send() {
  if (!inDesktopApp || !canSend.value) return
  busy.value = true; error.value = ''
  try {
    const answer = await bridge!.reportProblem!(note.value.trim())
    if (answer.ok) outcome.value = answer.delivered === true ? t('privacy.report.sent') : t('privacy.report.queued')
    else if (answer.error === 'limit') outcome.value = limitText(answer)
    else error.value = t(ERRORS[answer.error ?? ''] ?? 'privacy.report.sendFailed')
  } catch { error.value = t('privacy.report.sendFailed') }
  finally { busy.value = false }
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
        <template v-else-if="outcome">
          <p class="rp-outcome" role="status">{{ outcome }}</p>
          <footer><button type="button" class="rc-btn" @click="emit('close')">{{ t('privacy.report.close') }}</button></footer>
        </template>
        <template v-else>
          <p>{{ t('privacy.report.intro') }}</p>
          <label class="rp-field"><span>{{ t('privacy.report.question') }}</span><textarea v-model="note" rows="4" maxlength="240" :placeholder="t('privacy.report.placeholder')" :disabled="busy" /></label>
          <p v-if="error" class="rp-error" role="alert">{{ error }}</p>
          <footer><button type="button" class="rc-btn rc-btn--primary" :disabled="!canSend" @click="send">{{ busy ? t('privacy.report.sending') : t('privacy.report.send') }}</button></footer>
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
.rp-outcome { color: #fff; font-size: 15px; }
.rp-error { padding: 8px 12px; border-left: 2px solid #ff0024; background: #ff00240a; color: #ff9aaa; }
footer { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
