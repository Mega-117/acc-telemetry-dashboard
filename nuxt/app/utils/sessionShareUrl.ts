// PIP-591 (X-A05-08): il link di condivisione deve aprirsi nel browser di chi lo riceve.
// Dal sito pubblicato vale l'indirizzo del sito, con il suo prefisso (`baseURL`).
// Dall'app desktop (protocollo locale, file o localhost) l'origine non e' raggiungibile da
// altri: si usa il sito pubblico stabile. Firebase e' condiviso, quindi il link funziona
// su entrambi i siti; GitHub Pages gestisce i link diretti con la sua pagina 404 SPA.
// PIP-672: sito pubblico su app.racercore.app (Develop su dev.racercore.app).
export const PUBLIC_SITE_URL = 'https://app.racercore.app/'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function buildSessionShareUrl(params: {
  sessionId: string
  userId: string
  location: Pick<Location, 'protocol' | 'hostname' | 'origin'> | null | undefined
  baseURL: string | null | undefined
  /** PIP-651: the tab the link opens on (the one it was shared from); Sessione when absent. */
  tab?: 'sessione' | 'telemetria'
}): string {
  const { location } = params
  const reachableOrigin = location && (location.protocol === 'https:' || location.protocol === 'http:')
    && !LOCAL_HOSTS.has(location.hostname) ? location.origin : null
  // baseURL '/' (o un eventuale prefisso): sempre con una sola barra ai due capi.
  const path = `/${String(params.baseURL || '').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')
  const base = reachableOrigin ? `${reachableOrigin}${path}` : PUBLIC_SITE_URL
  return `${base}sessioni/${encodeURIComponent(params.sessionId)}?userId=${encodeURIComponent(params.userId)}${params.tab === 'telemetria' ? '&tab=telemetria' : ''}`
}
