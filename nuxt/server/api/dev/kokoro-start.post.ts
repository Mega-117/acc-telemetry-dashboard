import { managedKokoro } from '../../utils/managedKokoro'

export default defineEventHandler(async () => {
  if (process.env.NODE_ENV === 'production') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  try {
    const result = await managedKokoro().start()
    if (result.status === 'error') throw new Error(result.message)
    return result
  } catch (error: any) {
    throw createError({ statusCode: 503, statusMessage: `Avvio Kokoro fallito: ${error?.message || 'runtime indisponibile'}` })
  }
})
