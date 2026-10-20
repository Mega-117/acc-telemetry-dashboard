// PIP-539: il processo principale di Electron non ha credenziali Firebase. Quando deve caricare
// un pacchetto diagnostico su R2 chiede qui l'ID token dell'utente; se l'utente non e' dentro
// (o il lease non e' piu' corrente) si risponde `null` e il pacchetto resta in coda.
// Nessuna scrittura Firestore: il token si legge dalla sessione gia' presente.
// PIP-567: con `forceRefresh` il main dice che il Worker ha rifiutato il token in cache come
// scaduto: si chiede a Firebase un token nuovo (`getIdToken(true)`), una volta per richiesta.

export type DiagnosticsTokenUser = { uid: string, getIdToken: (forceRefresh?: boolean) => Promise<string> }
export type DiagnosticsTokenRequestOptions = { forceRefresh?: boolean }

export function createDiagnosticsTokenResponder(options: {
  getUser: () => DiagnosticsTokenUser | null | undefined
  isAllowed: (uid: string) => boolean
  reply: (requestId: string, token: string | null) => Promise<unknown> | unknown
}) {
  return async function respond(requestId: string, request: DiagnosticsTokenRequestOptions = {}): Promise<void> {
    let token: string | null = null
    try {
      const user = options.getUser()
      if (user?.uid && options.isAllowed(user.uid)) {
        const value = request?.forceRefresh === true ? await user.getIdToken(true) : await user.getIdToken()
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
