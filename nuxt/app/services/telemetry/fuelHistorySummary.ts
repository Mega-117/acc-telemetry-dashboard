import { BEST_RULES_VERSION } from './raceFuelClassification'
import type { SessionSummary } from '~/types/telemetry'

/** Cloud retains the original envelope. Consumers read an explicitly versioned view. */
export function readFuelHistory(summary: unknown, gameId: string): Partial<SessionSummary> {
  if (gameId !== 'evo' || !summary || typeof summary !== 'object') return {}
  const value = summary as Record<string, unknown>
  const history = value.fuel_history as Record<string, unknown> | undefined
  if (value.schema !== 'racercore.timing-summary' || value.version !== 1
    || !history || history.best_rules_version !== BEST_RULES_VERSION) return {}
  return Object.fromEntries(Object.entries(history).filter(([key]) => key.startsWith('best_'))) as Partial<SessionSummary>
}
