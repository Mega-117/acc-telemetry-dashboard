export type OverviewProjectionLoadResult<T> =
  | { status: 'ready'; projection: T | null }
  | { status: 'cloud-unavailable'; error: unknown }

export async function loadOverviewProjectionRecoverably<T>(
  loadProjection: () => Promise<T | null>
): Promise<OverviewProjectionLoadResult<T>> {
  try {
    return {
      status: 'ready',
      projection: await loadProjection()
    }
  } catch (error) {
    return {
      status: 'cloud-unavailable',
      error
    }
  }
}
