import { listChatterboxVoices, resolveChatterboxVoiceDir } from '../../utils/chatterboxVoiceCatalog'

export default defineEventHandler(() => {
  if (process.env.NODE_ENV === 'production') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return {
    voices: listChatterboxVoices(),
    voiceDir: resolveChatterboxVoiceDir(),
  }
})
