// PIP-637: il percorso della vista admin/coach di un pilota, dalla lista piloti alla pagina aperta.
export type PilotDetail = 'none' | 'track' | 'session' | 'stats'
export interface PilotCrumb {
  label: string
  /** Dove porta il clic; null sull'ultima voce, la pagina in cui sei. */
  target: 'pilots' | 'pilot' | 'tab' | null
}

export function pilotTrail(o: { pilotName: string, tabLabel: string, detail: PilotDetail, trackName: string | null }): PilotCrumb[] {
  const tab = o.tabLabel ? o.tabLabel.charAt(0) + o.tabLabel.slice(1).toLowerCase() : ''
  const crumbs: PilotCrumb[] = [{ label: 'Piloti', target: 'pilots' }, { label: o.pilotName, target: 'pilot' }]
  if (o.detail === 'none') return [...crumbs, { label: tab, target: null }]
  const page = o.detail === 'track' ? (o.trackName || 'Pista') : o.detail === 'session' ? 'Sessione' : 'Statistiche'
  return [...crumbs, { label: tab, target: 'tab' }, { label: page, target: null }]
}
