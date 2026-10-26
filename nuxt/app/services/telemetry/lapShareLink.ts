// PIP-623: link "Condividi giro". Il giro e la sua chiave stanno nel frammento (`#`), che il
// browser non manda mai a nessun server: chi riceve incolla il link nella Telemetria di una sua
// sessione. Stessa base del sito pubblico usata dal programma (desktop-app/runtime/lapShare.js).

export const LAP_SHARE_LINK_BASE = 'https://mega-117.github.io/acc-telemetry-dashboard/docs/giro'

export interface LapShareRef { shareId: string, key: string }

const PAIR = /([a-f0-9]{32})\.([a-f0-9]{32})/

export function buildLapShareLink(shareId: string, key: string, base = LAP_SHARE_LINK_BASE): string {
  return `${base}#${shareId}.${key}`
}

/** Accetta il link intero, il solo frammento o la coppia `shareId.key`; altrimenti null. */
export function parseLapShareLink(text: unknown): LapShareRef | null {
  if (typeof text !== 'string') return null
  const value = text.trim()
  if (!value || value.length > 400) return null
  const hash = value.includes('#') ? value.slice(value.indexOf('#') + 1) : value
  const match = PAIR.exec(hash.toLowerCase())
  return match ? { shareId: match[1]!, key: match[2]! } : null
}

/** Messaggio per l'interfaccia da un errore della condivisione (Electron lo avvolge: si cerca il codice). */
export function lapShareErrorMessage(error: unknown): string {
  const text = String((error as Error)?.message || error)
  if (text.includes('archive-paused')) return 'Archivio giri in pausa: riprova più tardi.'
  if (text.includes('share-daily-cap')) return 'Hai raggiunto le condivisioni di oggi.'
  if (text.includes('auth-required') || text.includes('owner-changed') || text.includes('token-unavailable')) return 'Accedi di nuovo per condividere.'
  if (text.includes('archive-disabled')) return 'Condivisione non disponibile in questa versione.'
  return 'Condivisione non riuscita: riprova.'
}
