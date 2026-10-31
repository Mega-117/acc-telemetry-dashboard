<script setup lang="ts">
// PIP-698 (user decision 31/10/2026): no privacy window at the first entry any more. Terms and Privacy
// are accepted at registration, where the optional usage-statistics choice is also sent. Here, at the
// first entry, it is sent again only if that first send failed. Rules in services/usage/registrationUsageChoice.ts.
import { onBeforeUnmount, watch } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { loadOwnerDocument } from '~/repositories/ownerDocumentRepository'
import { applyRegistrationUsageChoice, defaultRegistrationUsageDeps } from '~/services/usage/registrationUsageChoice'

const RETRY_MS = 30_000
const { currentUser } = useFirebaseAuth()
let run = 0, timer: ReturnType<typeof setTimeout> | null = null

// One attempt chain per account; a new account or leaving the dashboard ends the previous chain.
async function attempt(uid: string, chain: number) {
  const user = currentUser.value
  const isCurrent = () => chain === run && currentUser.value?.uid === uid
  if (!user || user.uid !== uid) return
  // The token is the one of this account: even a late write can only reach this account's preference.
  const deps = defaultRegistrationUsageDeps(() => user.getIdToken())
  let outcome: 'done' | 'retry' | 'stale' = 'retry'
  try { outcome = await applyRegistrationUsageChoice(uid, loadOwnerDocument, isCurrent, deps) } catch { /* retry */ }
  // Only after a failed send at registration: retrying every 30 s, before the 5-minute uploads.
  if (outcome === 'retry' && isCurrent()) timer = setTimeout(() => void attempt(uid, chain), RETRY_MS)
}

watch(() => currentUser.value?.uid, (uid) => {
  run++
  if (timer) clearTimeout(timer)
  timer = null
  if (uid) void attempt(uid, run)
}, { immediate: true })

onBeforeUnmount(() => { run++; if (timer) clearTimeout(timer) })
</script>

<template>
  <span hidden />
</template>
