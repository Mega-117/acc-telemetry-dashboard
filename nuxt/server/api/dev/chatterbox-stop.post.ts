import { clearManagedChatterboxProcess, getManagedChatterboxPid, stopManagedChatterboxProcess } from '../../utils/chatterboxProcessRegistry'
import { readChatterboxRuntimeStatus } from '../../utils/chatterboxRuntimeStatus'

export default defineEventHandler(async () => {
  if (process.env.NODE_ENV === 'production') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const current = await readChatterboxRuntimeStatus()
  if (current.state === 'offline') {
    clearManagedChatterboxProcess()
    return { status: 'offline' }
  }
  const pid = getManagedChatterboxPid()
  if (!pid) return { status: 'skipped', reason: 'not-managed' }
  return stopManagedChatterboxProcess()
})
