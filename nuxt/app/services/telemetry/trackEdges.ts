// PIP-636: bordi della pista (ACC Drive _L/_R) per la mappa della Telemetria anche nel sito.
// Nel programma desktop arrivano da Electron; nel browser dai file statici `public/track-edges/<sim>/<pista>.json`,
// copia identica dei file del programma (scripts/sync_track_edges_web.py), una pista alla volta.
export interface TrackEdges { left: [number, number][], right: [number, number][] }

const MAX_POINTS = 20000

/** Stessa chiave file del programma desktop: minuscolo, underscore; con la variante `pista__variante`. */
export function trackEdgeKey(track: string | null | undefined, variant?: string | null): string | null {
  const norm = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const key = norm(track)
  if (!key) return null
  const variantKey = norm(variant)
  return variantKey ? `${key}__${variantKey}` : key
}

/** Come il programma: due linee di punti [x, z] validi, altrimenti niente bordi. */
export function parseTrackEdges(value: unknown): TrackEdges | null {
  const valid = (points: unknown): points is [number, number][] => Array.isArray(points) && points.length >= 2 && points.length <= MAX_POINTS
    && points.every(p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  const v = value as { left?: unknown, right?: unknown } | null
  return v && valid(v.left) && valid(v.right) ? { left: v.left, right: v.right } : null
}

const cache = new Map<string, Promise<TrackEdges | null>>()

/** I bordi dal sito; null se la pista non li ha o il file non si legge (la mappa disegna la sola linea). */
export function loadWebTrackEdges(
  track: string | null | undefined, sim: string | null | undefined, variant: string | null | undefined,
  deps: { fetch: typeof fetch, publicPath: (path: string) => string },
): Promise<TrackEdges | null> {
  const key = trackEdgeKey(track, variant)
  const simKey = trackEdgeKey(sim || 'acc')
  if (!key || !simKey) return Promise.resolve(null)
  const id = `${simKey}/${key}`
  if (!cache.has(id)) {
    cache.set(id, deps.fetch(deps.publicPath(`/track-edges/${id}.json`))
      // A missing track (404) is final; any other failure (503, 429…) is retried at the next opening.
      .then((response) => { if (response.ok) return response.json(); if (response.status === 404) return null; throw new Error(`track edges ${response.status}`) })
      .then(parseTrackEdges)
      // Un errore di rete non resta in memoria: alla prossima apertura si riprova.
      .catch(() => { cache.delete(id); return null }))
  }
  return cache.get(id)!
}
