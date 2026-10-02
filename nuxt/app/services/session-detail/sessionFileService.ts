import { recordingGame } from '~/services/telemetry/gameIdentity'

export function canShareOwnedSession(currentOwner: string | undefined, viewedOwner?: string | null): boolean {
  return !!currentOwner && (!viewedOwner || viewedOwner === currentOwner)
}

/** Export the recording, never a presentation model or a new owner's copy. */
export function prepareSessionExport(session: unknown, sessionId: string) {
  if (!recordingGame(session)) throw new Error('Formato sessione non supportato')
  return {
    fileName: `session_${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`,
    text: JSON.stringify(session, null, 2)
  }
}

export function downloadSession(session: unknown, sessionId: string): void {
  const file = prepareSessionExport(session, sessionId)
  const url = URL.createObjectURL(new Blob([file.text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.fileName
  link.click()
  // Electron can keep its native save dialog open indefinitely. Revoking on a
  // timer can cancel that pending download; the document owns the URL lifetime.
  window.addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true })
}
