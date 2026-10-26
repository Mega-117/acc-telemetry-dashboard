<script setup lang="ts">
// PIP-623: pannello admin "Archivio giri" (stesso schema della pagina Utilizzo).
import { ref, onMounted, onBeforeUnmount } from 'vue'
import AdminLapsArchiveView from '~/components/admin/AdminLapsArchiveView.vue'
import { loadLapsArchive, switchLapsArchive, type LapsArchiveModel } from '~/repositories/lapsArchiveRepository'
import { loadUsageNames } from '~/repositories/usageRepository'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
definePageMeta({ layout: 'coach', middleware: ['admin-only'] })
useHead({ title: 'Archivio giri · Racer Core' })
const { currentUser } = useFirebaseAuth()
const deps = { getToken: async () => (await currentUser.value?.getIdToken()) ?? null }
const model = ref<LapsArchiveModel | null>(null), names = ref<Record<string, string>>({})
const loading = ref(false), error = ref(''), switching = ref(false)
let requestId = 0, disposed = false
async function refresh() {
  const id = ++requestId
  loading.value = true; error.value = ''
  try {
    const next = await loadLapsArchive(deps)
    // I nomi sono un arricchimento: senza Firestore si mostrano gli uid.
    const nextNames = await loadUsageNames(next.pilots.map(p => p.uid)).catch(() => names.value)
    if (disposed || id !== requestId) return
    model.value = next; names.value = nextNames
  } catch (e) { if (!disposed && id === requestId) error.value = e instanceof Error ? e.message : 'Lettura non riuscita.' }
  finally { if (!disposed && id === requestId) loading.value = false }
}
async function toggle(mode: 'auto' | 'off') {
  switching.value = true
  try { await switchLapsArchive(mode, deps); await refresh() }
  catch (e) { error.value = e instanceof Error ? e.message : 'Interruttore non aggiornato.' }
  finally { switching.value = false }
}
onMounted(() => refresh())
onBeforeUnmount(() => { disposed = true; requestId++ })
</script>
<template><AdminLapsArchiveView :model="model" :names="names" :loading="loading" :error="error" :switching="switching" @refresh="refresh" @switch="toggle" /></template>
