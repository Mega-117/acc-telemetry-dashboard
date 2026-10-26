// PIP-615: settimana di stabilita' sul Worker della diagnostica (`/v1/admin/stability`, solo admin).
import { parseStabilityState, type StabilityState } from '~/utils/adminStabilityWeek'

export interface StabilityDeps {
  getToken: () => Promise<string | null>
  origin: string
  fetchImpl?: typeof fetch
}

async function call(deps: StabilityDeps, init: RequestInit = {}): Promise<StabilityState> {
  const token = await deps.getToken()
  if (!token) throw new Error('Sessione non disponibile: accedi di nuovo.')
  const response = await (deps.fetchImpl ?? fetch)(`${deps.origin}/v1/admin/stability`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 403) throw new Error('Solo un admin può vedere e azzerare la settimana di stabilità.')
  if (!response.ok) throw new Error(`Servizio non disponibile (${response.status}).`)
  const state = parseStabilityState(await response.json())
  if (!state) throw new Error('Risposta non valida dal servizio.')
  return state
}

export const loadStabilityState = (deps: StabilityDeps) => call(deps)

// startDay: il giorno locale dell'admin, lo stesso calendario con cui la pagina conta i giorni.
export const resetStabilityWeek = (deps: StabilityDeps, reason: string, task: string, startDay: string) =>
  call(deps, { method: 'PUT', body: JSON.stringify({ action: 'reset', reason, task, startDay }) })
