<script setup lang="ts">
// PIP-658: "Cancella account" in the Profile. Password + typed confirmation, then every step in order; if it
// stops halfway, signing in again and repeating finishes the job (accountDeletion.ts).
import { computed, ref } from 'vue'
import { X } from '@lucide/vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { db } from '~/config/firebase'
import { deleteAccountEverywhere, type DeletionStep } from '~/services/auth/accountDeletion'
import { usageOrigin } from '~/services/usage/usageClient'

const { currentUser, logout } = useFirebaseAuth()
const open = ref(false), password = ref(''), typed = ref(''), busy = ref(false), error = ref(''), step = ref<DeletionStep | null>(null)
const ready = computed(() => !busy.value && password.value.length > 0 && typed.value.trim().toUpperCase() === 'CANCELLA')
const STEP_LABEL: Record<DeletionStep, string> = { verify: 'Verifico la password…', archive: 'Cancello i giri online e le statistiche…',
  documents: 'Cancello sessioni e dati…', profile: 'Cancello il profilo…', account: "Chiudo l'account…", done: 'Fatto.' }

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
      ? 'Password non corretta.'
      : "Cancellazione interrotta. Quello che è già stato cancellato resta cancellato: riprova per completarla."
  } finally { busy.value = false }
}
</script>

<template>
  <section class="danger">
    <h3>Cancella account</h3>
    <p>Elimina l'account e tutti i dati online: sessioni, giri, riferimenti condivisi, statistiche. Non si può annullare. I file sul tuo PC restano tuoi.</p>
    <button type="button" class="rc-btn rc-btn--compact danger__open" @click="open = true">Cancella account</button>

    <Teleport to="body">
      <div v-if="open" class="del-backdrop" @click.self="close">
        <div class="del-modal" role="dialog" aria-modal="true" aria-labelledby="del-title" @keydown.esc="close">
          <header>
            <h2 id="del-title">Cancellare l'account?</h2>
            <button type="button" class="modal-close" aria-label="Chiudi" :disabled="busy" @click="close"><X :size="20" aria-hidden="true" /></button>
          </header>
          <p>Vengono eliminati in modo definitivo l'account e tutti i dati online. Per confermare inserisci la password e scrivi <strong>CANCELLA</strong>.</p>
          <label class="del-field"><span>Password</span><input v-model="password" type="password" autocomplete="current-password" :disabled="busy"></label>
          <label class="del-field"><span>Scrivi CANCELLA</span><input v-model="typed" type="text" autocomplete="off" spellcheck="false" :disabled="busy"></label>
          <p v-if="busy && step" class="del-step" role="status">{{ STEP_LABEL[step] }}</p>
          <p v-if="error" class="del-error" role="alert">{{ error }}</p>
          <footer>
            <button type="button" class="rc-btn rc-btn--compact" :disabled="busy" @click="close">Annulla</button>
            <button type="button" class="rc-btn rc-btn--primary" :disabled="!ready" @click="confirm">{{ busy ? 'Cancello…' : 'Cancella definitivamente' }}</button>
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
