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
  timing_offset_sec?: number | null
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

// Due punti entro questa distanza normalizzata (~0.05% del giro) sono lo
// stesso punto fisico: fallback quando gli id shipped cambiano tra versioni.
const POSITION_MATCH_TOLERANCE = 0.0005

// PIP-222: merge per identita' del punto (id, poi posizione), mai per
// conteggio. I punti locali senza corrispondente shipped (es. marcati
// dall'utente) si sommano: i dati locali non vengono mai scartati.
function mergeGroupByIdentity(defaultGroup: TrackVoicePoint[], localGroup: TrackVoicePoint[]) {
  const matchedLocalIndexes = new Set<number>()
  const localIndexById = new Map(localGroup.map((point, index) => [point.id, index]))

  const findLocalMatch = (defaultPoint: TrackVoicePoint) => {
    const byId = localIndexById.get(defaultPoint.id)
    if (byId !== undefined && !matchedLocalIndexes.has(byId)) return byId
    let best = -1
    let bestDistance = POSITION_MATCH_TOLERANCE
    localGroup.forEach((localPoint, index) => {
      if (matchedLocalIndexes.has(index)) return
      const distance = Math.abs(Number(localPoint.normalized_car_position) - Number(defaultPoint.normalized_car_position))
      if (Number.isFinite(distance) && distance <= bestDistance) {
        best = index
        bestDistance = distance
      }
    })
    return best >= 0 ? best : undefined
  }

  const merged = defaultGroup.map((defaultPoint) => {
    const localIndex = findLocalMatch(defaultPoint)
    if (localIndex === undefined) return defaultPoint
    matchedLocalIndexes.add(localIndex)
    return mergeCompatiblePoint(defaultPoint, localGroup[localIndex]!)
  })
  localGroup.forEach((localPoint, index) => {
    if (!matchedLocalIndexes.has(index)) merged.push(localPoint)
  })
  return merged
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
    mergedPoints.push(...mergeGroupByIdentity(defaultGroup, localGroup))
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
