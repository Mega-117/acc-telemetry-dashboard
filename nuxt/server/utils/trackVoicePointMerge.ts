export interface TrackVoicePoint {
  id: string
  track: string
  car?: string
  type?: string
  normalized_car_position: number
  label?: string
  text?: string
  audio_path?: string
  audio_voice?: string
  audio_paths?: Record<string, string>
  speed?: number
  enabled?: boolean
  lead_time_sec?: number | null
  created_at?: string
  source?: string
}

export interface TrackVoicePointStore {
  schema: string
  version: number
  points: TrackVoicePoint[]
}

function pointGroupKey(point: TrackVoicePoint) {
  return `${String(point.track || '').trim().toLowerCase()}::${String(point.type || '').trim().toLowerCase()}`
}

function groupPoints(points: TrackVoicePoint[]) {
  const groups = new Map<string, TrackVoicePoint[]>()
  const order: string[] = []
  for (const point of points) {
    const key = pointGroupKey(point)
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(point)
  }
  return { groups, order }
}

function mergeAudioPaths(defaultPoint: TrackVoicePoint, localPoint: TrackVoicePoint) {
  const merged = { ...(defaultPoint.audio_paths || {}) }
  if (defaultPoint.audio_path && defaultPoint.audio_voice) merged[defaultPoint.audio_voice] = defaultPoint.audio_path
  Object.assign(merged, localPoint.audio_paths || {})
  if (localPoint.audio_path && localPoint.audio_voice) merged[localPoint.audio_voice] = localPoint.audio_path
  return Object.keys(merged).length ? merged : undefined
}

function mergeCompatiblePoint(defaultPoint: TrackVoicePoint, localPoint: TrackVoicePoint) {
  return {
    ...defaultPoint,
    ...localPoint,
    audio_paths: mergeAudioPaths(defaultPoint, localPoint),
  }
}

function mergeCompatibleGroup(defaultGroup: TrackVoicePoint[], localGroup: TrackVoicePoint[]) {
  const localById = new Map(localGroup.map(point => [point.id, point]))
  return defaultGroup.map((defaultPoint, index) => {
    const localPoint = localById.get(defaultPoint.id) || localGroup[index] || defaultPoint
    return mergeCompatiblePoint(defaultPoint, localPoint)
  })
}

export function mergeTrackVoicePointStores(
  defaultStore: TrackVoicePointStore,
  localStore: TrackVoicePointStore,
): TrackVoicePointStore {
  const defaultPoints = Array.isArray(defaultStore.points) ? defaultStore.points : []
  const localPoints = Array.isArray(localStore.points) ? localStore.points : []

  if (!defaultPoints.length) return localStore
  if (!localPoints.length) return { ...defaultStore, points: defaultPoints }

  const defaultGrouped = groupPoints(defaultPoints)
  const localGrouped = groupPoints(localPoints)
  const usedLocalGroups = new Set<string>()
  const mergedPoints: TrackVoicePoint[] = []

  for (const key of defaultGrouped.order) {
    const defaultGroup = defaultGrouped.groups.get(key) || []
    const localGroup = localGrouped.groups.get(key)
    if (!localGroup) {
      mergedPoints.push(...defaultGroup)
      continue
    }

    usedLocalGroups.add(key)
    if (localGroup.length === defaultGroup.length) {
      mergedPoints.push(...mergeCompatibleGroup(defaultGroup, localGroup))
    } else {
      mergedPoints.push(...defaultGroup)
    }
  }

  for (const key of localGrouped.order) {
    if (!usedLocalGroups.has(key)) mergedPoints.push(...(localGrouped.groups.get(key) || []))
  }

  return {
    schema: localStore.schema || defaultStore.schema,
    version: Math.max(Number(defaultStore.version || 1), Number(localStore.version || 1)),
    points: mergedPoints,
  }
}
