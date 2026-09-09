import { ref, shallowRef } from 'vue'
import type { OverviewProjection } from '~/types/overviewProjections'
import { loadOverviewProjectionRecoverably } from '~/services/gateway/overviewProjectionLoadPolicy'

/** Request ownership belongs to this view, independently of the sessions loader. */
export function useOverviewProjection(loadProjection: (uid: string) => Promise<OverviewProjection | null>) {
  const projection = shallowRef<OverviewProjection | null>(null)
  const status = ref<'pending' | 'ready' | 'empty' | 'error'>('pending')
  let owner: string | null = null
  let revision = 0
  async function load(uid: string | null | undefined) {
    const request = ++revision
    const nextOwner = uid || null
    if (owner !== nextOwner) projection.value = null
    owner = nextOwner
    status.value = 'pending'
    if (!nextOwner) return
    const result = await loadOverviewProjectionRecoverably(() => loadProjection(nextOwner))
    if (request !== revision) return
    if (result.status === 'ready') {
      projection.value = result.projection
      status.value = result.projection ? 'ready' : 'empty'
    } else {
      status.value = 'error'
    }
  }
  function dispose() { revision += 1 }
  return { projection, status, load, dispose }
}
