<script setup lang="ts">
// PIP-658: "Cancella account" in the Profile. Password + typed confirmation, then every step in order; if it
// stops halfway, signing in again and repeating finishes the job (accountDeletion.ts).
import { computed, ref } from 'vue'
import { X } from '@lucide/vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { db } from '~/config/firebase'
import { deleteAccountEverywhere, type DeletionStep } from '~/services/auth/accountDeletion'
import { usageOrigin } from '~/services/usage/usageClient'
import { useI18n } from '~/i18n'

const { currentUser, logout } = useFirebaseAuth()
const { t } = useI18n()
// The word to type follows the interface language (CANCELLA / DELETE); compared only, never stored.
const confirmWord = computed(() => t('privacy.deletion.confirmWord'))
const open = ref(false), password = ref(''), typed = ref(''), busy = ref(false), error = ref(''), step = ref<DeletionStep | null>(null)
const ready = computed(() => !busy.value && password.value.length > 0 && typed.value.trim().toUpperCase() === confirmWord.value)

function close() { if (!busy.value) { open.value = false; password.value = ''; typed.value = ''; error.value = '' } }

async function confirm() {
  const user = currentUser.value
  if (!user || !ready.value) return
  busy.value = true; error.value = ''
  try {
    await deleteAccountEverywhere(user, password.value, { db, workerOrigin: usageOrigin(), onStep: (s) => { step.value = s } })
    await Promise.resolve(logout()).catch(() => {})
  } catch (e) {
    const code = (e as { code?: string })?.code || ''
    error.value = code.includes('wrong-password') || code.includes('invalid-credential')
      ? t('privacy.deletion.wrongPassword')
      : t('privacy.deletion.interrupted')
  } finally { busy.value = false }
}
</script>

<template>
  <section class="danger">
    <h3>{{ t('privacy.deletion.title') }}</h3>
    <p>{{ t('privacy.deletion.text') }}</p>
    <button type="button" class="rc-btn rc-btn--compact danger__open" @click="open = true">{{ t('privacy.deletion.open') }}</button>

    <Teleport to="body">
      <div v-if="open" class="del-backdrop" @click.self="close">
        <div class="del-modal" role="dialog" aria-modal="true" aria-labelledby="del-title" @keydown.esc="close">
          <header>
            <h2 id="del-title">{{ t('privacy.deletion.dialogTitle') }}</h2>
            <button type="button" class="modal-close" :aria-label="t('privacy.deletion.close')" :disabled="busy" @click="close"><X :size="20" aria-hidden="true" /></button>
          </header>
          <p>{{ t('privacy.deletion.confirmBefore') }}<strong>{{ confirmWord }}</strong>{{ t('privacy.deletion.confirmAfter') }}</p>
          <label class="del-field"><span>{{ t('privacy.deletion.password') }}</span><input v-model="password" type="password" autocomplete="current-password" :disabled="busy"></label>
          <label class="del-field"><span>{{ t('privacy.deletion.typeWord', { word: confirmWord }) }}</span><input v-model="typed" type="text" autocomplete="off" spellcheck="false" :disabled="busy"></label>
          <p v-if="busy && step" class="del-step" role="status">{{ t(`privacy.deletion.step.${step}`) }}</p>
          <p v-if="error" class="del-error" role="alert">{{ error }}</p>
          <footer>
            <button type="button" class="rc-btn rc-btn--compact" :disabled="busy" @click="close">{{ t('privacy.deletion.cancel') }}</button>
            <button type="button" class="rc-btn rc-btn--primary" :disabled="!ready" @click="confirm">{{ busy ? t('privacy.deletion.deleting') : t('privacy.deletion.submit') }}</button>
          </footer>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.danger { border-top: 1px solid #ffffff20; margin-top: 24px; padding-top: 16px; }
.danger h3 { margin: 0 0 6px; font-size: 14px; }
.danger p { font-size: 13px; opacity: .75; line-height: 1.5; margin: 0 0 12px; }
.del-backdrop { position: fixed; inset: 0; z-index: 3100; display: grid; place-items: center; padding: 24px; background: #000000a6; backdrop-filter: blur(10px); }
:global(body:has(.electron-titlebar)) .del-backdrop { top: 36px; }
.del-modal { width: min(520px, 100%); padding: 26px; border: 1px solid var(--rc-section-line); background: #0a0a0da6; color: #fff; }
.del-modal header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.del-modal h2 { margin: 0; font: italic 700 22px/1.2 'Racer Display', sans-serif; text-transform: uppercase; }
.del-modal p { color: #c9c9d1; font-size: 13.5px; line-height: 1.5; }
.modal-close { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border: 1px solid var(--rc-section-line); background: transparent; color: #ffffffc7; cursor: pointer; }
.modal-close:hover { color: #fff; border-color: #ffffffa6; background: #ffffff12; }
.del-field { display: grid; gap: 6px; margin-top: 12px; }
.del-field span { color: #ccc; font-size: 12px; }
.del-field input { height: 42px; padding: 0 12px; border: 1px solid #ffffff30; border-radius: 0; background: #ffffff04; color: #fff; font-size: 14px; }
.del-field input:focus { border-color: #ff0024; outline: 1px solid #ff0024; outline-offset: 1px; }
.del-step { margin-top: 14px; color: #fff; }
.del-error { margin-top: 12px; padding: 8px 12px; border-left: 2px solid #ff0024; background: #ff00240a; color: #ff9aaa; }
.del-modal footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
</style>
