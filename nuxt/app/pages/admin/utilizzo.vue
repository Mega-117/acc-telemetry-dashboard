<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import AdminUsageView from '~/components/admin/AdminUsageView.vue'
import { loadUsage, loadUsageNames, loadUsageDetails, loadUsagePreferences } from '~/repositories/usageRepository'
import { usageCalendarDays, type UsageItem, type UsageDetail, type UsagePeriod } from '~/utils/usageMetrics'
definePageMeta({ layout: 'coach', middleware: ['admin-only'] })
useHead({ title: 'Utilizzo · Racer Core' })
const items = ref<UsageItem[]>([]), names = ref<Record<string, string>>({}), days = ref(usageCalendarDays(7))
const loading = ref(false), updatedAt = ref<number | null>(null), error = ref('')
const selected = ref(''), details = ref<UsageDetail[]>([]), detailLoading = ref(false), detailError = ref('')
const preferences = ref<Record<string, { enabled: boolean }>>({})
let requestId = 0, detailId = 0, disposed = false
async function refresh(period: UsagePeriod = 7) {
  const id = ++requestId, nextDays = usageCalendarDays(period)
  loading.value = true; error.value = ''
  try {
    const next = await loadUsage(nextDays)
    const nextNames = await loadUsageNames([...new Set(next.map(i => i.uid))])
    if (disposed || requestId !== id) return
    items.value = next; names.value = nextNames; days.value = nextDays; updatedAt.value = Date.now()
    if (selected.value) void select(selected.value)
  } catch (e) { if (!disposed && id === requestId) error.value = e instanceof Error ? e.message : 'Lettura non riuscita.' }
  finally { if (!disposed && id === requestId) loading.value = false }
}
async function select(uid: string) {
  const id = ++detailId
  selected.value = uid; details.value = []; detailLoading.value = true; detailError.value = ''
  try { const value = await loadUsageDetails(items.value.filter(i => i.uid === uid)); if (!disposed && id === detailId) details.value = value }
  catch (e) { if (!disposed && id === detailId) detailError.value = e instanceof Error ? e.message : 'Dettaglio non disponibile.' }
  finally { if (!disposed && id === detailId) detailLoading.value = false }
}
async function visible(uids: string[]) {
  if (!uids.length) return
  try { const value = await loadUsagePreferences(uids); if (!disposed) preferences.value = { ...preferences.value, ...value } }
  catch { /* Overview remains useful; an unknown preference is never shown as disabled. */ }
}
onMounted(() => refresh())
onBeforeUnmount(() => { disposed = true; requestId++; detailId++ })
</script>
<template><AdminUsageView :items="items" :names="names" :days="days" :loading="loading" :updated-at="updatedAt" :error="error" :selected="selected" :details="details" :detail-loading="detailLoading" :detail-error="detailError" :preferences="preferences" @refresh="refresh" @select="select" @visible="visible" /></template>
