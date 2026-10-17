import { OverviewNotReadyError } from './offlineOverviewPolicy'

export type OverviewProjectionLoadResult<T> =
  | { status: 'ready'; projection: T | null }
  | { status: 'cloud-unavailable'; error: unknown }
  // PIP-555: il cloud non e' ancora pronto e non c'e' un archivio locale da mostrare.
  | { status: 'not-ready' }

export async function loadOverviewProjectionRecoverably<T>(
  loadProjection: () => Promise<T | null>
): Promise<OverviewProjectionLoadResult<T>> {
  try {
    return {
      status: 'ready',
      projection: await loadProjection()
    }
  } catch (error) {
    if (error instanceof OverviewNotReadyError) return { status: 'not-ready' }
    return {
      status: 'cloud-unavailable',
      error
    }
  }
}
