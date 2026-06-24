import { readVoicePoints } from '../utils/devVoicePoints'

export default defineEventHandler(async () => {
  const store = await readVoicePoints()
  const tracks = [...new Set(store.points.map(point => String(point.track || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))

  return { ...store, tracks }
})

