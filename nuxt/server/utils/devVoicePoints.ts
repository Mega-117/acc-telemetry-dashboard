import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

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
  speed?: number
  lead_time_sec?: number | null
  created_at?: string
  source?: string
}

export interface TrackVoicePointStore {
  schema: string
  version: number
  points: TrackVoicePoint[]
}

const VOICE_POINTS_SCHEMA = 'acc.track_voice_points.v1'

async function exists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function resolveSuiteRoot() {
  const candidates = [
    process.env.ACC_SUITE_ROOT,
    process.env.ACC_LOCAL_SUITE_ROOT,
    resolve(process.cwd(), '..', '..'),
    resolve(process.cwd(), '..', '..', '..'),
    process.cwd(),
  ].filter((value): value is string => Boolean(value))

  for (const root of candidates) {
    const voicePointsPath = join(root, 'training_data', 'voice_points.json')
    if (await exists(voicePointsPath)) return root
  }

  return candidates[0] || process.cwd()
}

export async function voicePointsPath() {
  const suiteRoot = await resolveSuiteRoot()
  return join(suiteRoot, 'training_data', 'voice_points.json')
}

export async function readVoicePoints(): Promise<TrackVoicePointStore> {
  const path = await voicePointsPath()
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      schema: parsed?.schema || VOICE_POINTS_SCHEMA,
      version: Number(parsed?.version || 1),
      points: Array.isArray(parsed?.points) ? parsed.points : [],
    }
  } catch {
    return { schema: VOICE_POINTS_SCHEMA, version: 1, points: [] }
  }
}

export async function writeVoicePoints(store: TrackVoicePointStore) {
  const path = await voicePointsPath()
  await mkdir(dirname(path), { recursive: true })
  const payload = {
    schema: store.schema || VOICE_POINTS_SCHEMA,
    version: Number(store.version || 1),
    points: Array.isArray(store.points) ? store.points : [],
  }
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return path
}
