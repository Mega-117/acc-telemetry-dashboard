<script setup lang="ts">
// PIP-658: the automatic technical diagnostics choice in the Profile (first asked on the privacy screen).
// Stored in users/{uid}.consent and handed to the desktop program, which stops automatic sending when off.
import { onMounted, ref } from 'vue'
import { doc, updateDoc } from 'firebase/firestore'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { db } from '~/config/firebase'
import { loadOwnerDocument, rememberOwnerDocumentPatch } from '~/repositories/ownerDocumentRepository'
import { setDesktopDiagnosticsConsent } from '~/services/usage/diagnosticsConsent'
import { useI18n } from '~/i18n'

const { currentUser } = useFirebaseAuth()
const { t } = useI18n()
const enabled = ref<boolean | null>(null), busy = ref(false), message = ref('')
let consent: Record<string, unknown> = {}

onMounted(async () => {
  const uid = currentUser.value?.uid
  if (!uid) return
  try {
    consent = ((await loadOwnerDocument(uid)).data as { consent?: Record<string, unknown> } | null)?.consent ?? {}
    enabled.value = consent.diagnostics !== false
  } catch { message.value = t('privacy.preference.unavailableLater') }
})

async function change(event: Event) {
  const uid = currentUser.value?.uid
  const next = (event.target as HTMLInputElement).checked
  if (!uid) return
  busy.value = true; message.value = ''
  try {
    const updated = { ...consent, diagnostics: next }
    await updateDoc(doc(db, 'users', uid), { consent: updated })
    rememberOwnerDocumentPatch(uid, { consent: updated })
    consent = updated
    enabled.value = next
    setDesktopDiagnosticsConsent(next)
  } catch {
    message.value = t('privacy.preference.notSaved')
    ;(event.target as HTMLInputElement).checked = !next
  } finally { busy.value = false }
}
</script>

<template>
  <section class="diagnostics-preference">
    <label><input type="checkbox" :checked="enabled === true" :disabled="busy || enabled === null" @change="change"> {{ t('privacy.diagnostics.label') }}</label>
    <p>{{ t('privacy.diagnostics.text') }}</p>
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>

<style scoped>
.diagnostics-preference { border-top: 1px solid #ffffff20; margin-top: 24px; padding-top: 16px; }
label { display: flex; gap: 8px; align-items: center; font-weight: 600; } input { accent-color: var(--color-primary, #ff6b35); }
p { font-size: 13px; opacity: .75; line-height: 1.5; margin-top: 12px; }
</style>
