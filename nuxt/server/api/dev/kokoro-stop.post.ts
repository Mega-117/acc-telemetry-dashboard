import { clearManagedKokoroProcess, getManagedKokoroPid, stopManagedKokoroProcess } from '../../utils/kokoroProcessRegistry'
import { readKokoroRuntimeStatus } from '../../utils/kokoroRuntimeStatus'

export default defineEventHandler(async () => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const current = await readKokoroRuntimeStatus()
  if (current.state === 'offline') {
    clearManagedKokoroProcess()
    return { status: 'offline' }
  }

  const managedPid = getManagedKokoroPid()
  if (!managedPid) {
    return {
      status: 'skipped',
      reason: 'not-managed',
      message: 'Kokoro e online ma non e stato avviato da ACC Suite in questa sessione.',
    }
  }

  const result = stopManagedKokoroProcess()
  return {
    status: result.status,
    pid: 'pid' in result ? result.pid : managedPid,
  }
})
