// PIP-539: il processo principale di Electron non ha credenziali Firebase. Quando deve caricare
// un pacchetto diagnostico su R2 chiede qui l'ID token dell'utente; se l'utente non e' dentro
// (o il lease non e' piu' corrente) si risponde `null` e il pacchetto resta in coda.
// Nessuna scrittura Firestore: il token si legge dalla sessione gia' presente.

export type DiagnosticsTokenUser = { uid: string, getIdToken: () => Promise<string> }

export function createDiagnosticsTokenResponder(options: {
  getUser: () => DiagnosticsTokenUser | null | undefined
  isAllowed: (uid: string) => boolean
  reply: (requestId: string, token: string | null) => Promise<unknown> | unknown
}) {
  return async function respond(requestId: string): Promise<void> {
    let token: string | null = null
    try {
      const user = options.getUser()
      if (user?.uid && options.isAllowed(user.uid)) {
        const value = await user.getIdToken()
        token = typeof value === 'string' && value ? value : null
      }
    } catch {
      // Un token non disponibile e' un "riprova piu' tardi", mai un errore dell'app.
      token = null
    }
    try {
      await options.reply(requestId, token)
    } catch {
      // Il main scade da solo dopo il timeout.
    }
  }
}
