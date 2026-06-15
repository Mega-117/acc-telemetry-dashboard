import { readKokoroRuntimeStatus } from '../../utils/kokoroRuntimeStatus'

export default defineEventHandler(async () => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return await readKokoroRuntimeStatus()
})
