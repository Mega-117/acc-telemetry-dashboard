import { readChatterboxRuntimeStatus } from '../../utils/chatterboxRuntimeStatus'

export default defineEventHandler(async () => {
  if (process.env.NODE_ENV === 'production') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return await readChatterboxRuntimeStatus()
})
