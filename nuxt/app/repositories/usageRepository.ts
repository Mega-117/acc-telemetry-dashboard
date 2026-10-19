import { collection, documentId, query, where } from 'firebase/firestore'
import { trackedGetDocs } from '~/composables/useFirebaseTracker'
import { db } from '~/config/firebase'
import { usageRequest } from '~/services/usage/usageClient'
import type { UsageDetail, UsageItem } from '~/utils/usageMetrics'
type RequestUsage = (path: string) => Promise<any>
export async function loadUsage(days: string[], request: RequestUsage = usageRequest): Promise<UsageItem[]> {
  const items = new Map<string, UsageItem>()
  for (const day of days) {
    let cursor: string | null = null
    const seen = new Set<string>()
    do {
      const result = await request(`/v1/admin/usage?day=${day}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      if (!Array.isArray(result.objects)) throw Error('Risposta utilizzo incompleta.')
      for (const item of result.objects) {
        if (typeof item.key !== 'string' || typeof item.uid !== 'string') throw Error('Riepilogo utilizzo non valido.')
        items.set(item.key, item)
      }
      cursor = result.truncated ? result.cursor : null
      if (result.truncated && (!cursor || seen.has(cursor))) throw Error('Paginazione utilizzo incompleta.')
      if (cursor) seen.add(cursor)
      if (seen.size > 100 || items.size > 100000) throw Error('Intervallo troppo grande: restringi a sette giorni.')
    } while (cursor)
  }
  return [...items.values()]
}
export async function loadUsageNames(uids: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {}
  for (let i = 0; i < uids.length; i += 30) {
    const snap = await trackedGetDocs(query(collection(db, 'pilotDirectory'), where(documentId(), 'in', uids.slice(i, i + 30))), 'UsageRepository')
    for (const doc of snap.docs) { const d = doc.data(); names[doc.id] = d.nickname || [d.firstName, d.lastName].filter(Boolean).join(' ') || doc.id }
  }
  return names
}
export async function loadUsageDetails(items: UsageItem[], request: RequestUsage = usageRequest): Promise<UsageDetail[]> {
  const result: UsageDetail[] = []
  for (let i = 0; i < items.length; i += 4) result.push(...await Promise.all(items.slice(i, i + 4).map(item => request('/v1/admin/usage/detail?key=' + encodeURIComponent(item.key)))))
  return result
}
export async function loadUsagePreferences(uids: string[], request: RequestUsage = usageRequest): Promise<Record<string, { enabled: boolean; revision: number }>> {
  return request('/v1/admin/usage/preferences?uids=' + encodeURIComponent(uids.join(',')))
}
