<script setup lang="ts">
// PIP-658: once per account (and again when Terms or Privacy change), the three privacy choices in plain
// words: usage statistics, technical diagnostics, sharing your laps as references. New accounts find the
// references off (server default, library.mjs); the team keeps what it had. Changeable later in the Profile.
import { computed, onMounted, ref } from 'vue'
import { doc, updateDoc } from 'firebase/firestore'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { db } from '~/config/firebase'
import { loadOwnerDocument, rememberOwnerDocumentPatch } from '~/repositories/ownerDocumentRepository'
import { getLibraryPreference, setLibraryPreference } from '~/services/telemetry/lapsArchiveClient'
import { usagePreference } from '~/services/usage/usageClient'
import { setDesktopDiagnosticsConsent } from '~/services/usage/diagnosticsConsent'
import { PRIVACY_VERSION, TERMS_VERSION, hasCurrentConsent, legalPageUrl } from '~/utils/legalVersions'
import { useI18n } from '~/i18n'

const { t } = useI18n()

const { currentUser } = useFirebaseAuth()
const deps = { getToken: async () => (await currentUser.value?.getIdToken()) ?? null }
const baseURL = useRuntimeConfig().app.baseURL
const open = ref(false), needsTexts = ref(false), busy = ref(false), error = ref('')
const acceptTerms = ref(false), acceptPrivacy = ref(false)
const usage = ref(true), diagnostics = ref(true), library = ref(false)
const canSave = computed(() => !busy.value && (!needsTexts.value || (acceptTerms.value && acceptPrivacy.value)))

// The account is bound to the usage client a moment after the dashboard appears: a few spaced attempts.
onMounted(async () => {
  for (let attempt = 0; attempt < 6 && !open.value; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 2500))
    if (await check() !== 'retry') return
  }
})

async function check(): Promise<'done' | 'retry'> {
  const uid = currentUser.value?.uid
  if (!uid) return 'retry'
  try {
    const owner = await loadOwnerDocument(uid)
    const consent = (owner.data as { consent?: Record<string, unknown> } | null)?.consent ?? null
    needsTexts.value = !hasCurrentConsent(consent)
    // The desktop program learns the stored choice at every start (it keeps it until told otherwise).
    if (consent?.choicesAt) setDesktopDiagnosticsConsent(consent.diagnostics !== false)
    if (consent?.choicesAt && !needsTexts.value) return 'done'
    // Start from what is true today, so the screen never changes anything by itself.
    const [usagePref, libraryPref] = await Promise.all([usagePreference().catch(() => null), getLibraryPreference(deps).catch(() => null)])
    // Codex: without the current values the screen could overwrite them: try again shortly / next start.
    if (!usagePref || typeof libraryPref !== 'boolean') return 'retry'
    usage.value = usagePref.enabled
    library.value = libraryPref
    diagnostics.value = consent?.diagnostics !== false
    open.value = true
    return 'done'
  } catch { return 'retry' /* the choices stay in the Profile; never block the dashboard for them */ }
}

async function save() {
  const uid = currentUser.value?.uid
  if (!uid || !canSave.value) return
  busy.value = true; error.value = ''
  try {
    await Promise.all([usagePreference(usage.value), setLibraryPreference(library.value, deps)])
    setDesktopDiagnosticsConsent(diagnostics.value)
    const now = new Date().toISOString()
    const consent = { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: now, choicesAt: now,
      usage: usage.value, diagnostics: diagnostics.value, library: library.value }
    await updateDoc(doc(db, 'users', uid), { consent })
    rememberOwnerDocumentPatch(uid, { consent })
    open.value = false
  } catch {
    error.value = t('privacy.choices.saveError')
  } finally { busy.value = false }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="pc-backdrop">
      <div class="pc-modal" role="dialog" aria-modal="true" aria-labelledby="pc-title">
        <span class="eyebrow">{{ t('privacy.choices.eyebrow') }}</span>
        <h2 id="pc-title">{{ t('privacy.choices.title') }}</h2>
        <p class="lead">{{ t('privacy.choices.lead') }}</p>

        <div v-if="needsTexts" class="pc-texts">
          <label><input v-model="acceptTerms" type="checkbox"><span>{{ t('auth.consent.termsBefore') }}<a :href="legalPageUrl('termini', baseURL)" target="_blank" rel="noopener">{{ t('auth.consent.termsLink') }}</a></span></label>
          <label><input v-model="acceptPrivacy" type="checkbox"><span>{{ t('auth.consent.privacyBefore') }}<a :href="legalPageUrl('privacy', baseURL)" target="_blank" rel="noopener">{{ t('auth.consent.privacyLink') }}</a></span></label>
        </div>

        <label class="pc-choice">
          <input v-model="usage" type="checkbox">
          <span><strong>{{ t('privacy.choices.usageTitle') }}</strong><small>{{ t('privacy.choices.usageText') }}</small></span>
        </label>
        <label class="pc-choice">
          <input v-model="diagnostics" type="checkbox">
          <span><strong>{{ t('privacy.choices.diagnosticsTitle') }}</strong><small>{{ t('privacy.choices.diagnosticsText') }}</small></span>
        </label>
        <label class="pc-choice">
          <input v-model="library" type="checkbox">
          <span><strong>{{ t('privacy.choices.libraryTitle') }}</strong><small>{{ t('privacy.choices.libraryText') }}</small></span>
        </label>

        <p v-if="error" class="pc-error" role="alert">{{ error }}</p>
        <footer>
          <button type="button" class="rc-btn rc-btn--primary" :disabled="!canSave" @click="save">{{ busy ? t('privacy.choices.saving') : t('privacy.choices.confirm') }}</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pc-backdrop { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 24px; background: #000000a6; backdrop-filter: blur(10px); }
:global(body:has(.electron-titlebar)) .pc-backdrop { top: 36px; }
.pc-modal { width: min(620px, 100%); max-height: calc(100dvh - 84px); overflow-y: auto; padding: 28px; border: 1px solid var(--rc-section-line); background: #0a0a0da6; color: #fff; }
.eyebrow { display: block; margin-bottom: 7px; color: #aaa; font-size: 11px; letter-spacing: 1.5px; font-weight: 500; text-transform: uppercase; }
h2 { margin: 0; font: italic 700 26px/1.2 'Racer Display', sans-serif; text-transform: uppercase; }
.lead { margin: 10px 0 20px; color: #c9c9d1; font-size: 14px; }
.pc-texts { display: grid; gap: 8px; margin-bottom: 18px; padding: 12px 14px; border-left: 2px solid #ffc400; background: #ffc4000a; font-size: 13px; }
.pc-texts label { display: flex; gap: 10px; align-items: center; cursor: pointer; }
.pc-choice { display: flex; gap: 12px; align-items: flex-start; padding: 14px 0; border-top: 1px solid #ffffff1a; cursor: pointer; }
.pc-choice strong { display: block; font-size: 14px; }
.pc-choice small { display: block; margin-top: 4px; color: #a9a9b3; font-size: 12.5px; line-height: 1.5; }
input[type=checkbox] { flex: none; width: 16px; height: 16px; margin-top: 2px; accent-color: #ff0024; cursor: pointer; }
a { color: #fff; text-decoration: underline; text-underline-offset: 2px; }
.pc-error { margin: 12px 0 0; padding: 8px 12px; border-left: 2px solid #ff0024; background: #ff00240a; color: #ff9aaa; font-size: 13px; }
footer { display: flex; justify-content: flex-end; margin-top: 18px; }
@media (max-width: 640px) { .pc-backdrop { padding: 14px; } .pc-modal { padding: 20px; } h2 { font-size: 22px; } }
</style>
