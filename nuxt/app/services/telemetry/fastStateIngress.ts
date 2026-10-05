import { readCommonLive } from './commonLive'
import { commonFastPresentation } from './commonFastPresentation'
import { EMPTY_FAST_STATE } from './emptyFastState'
import { usesLegacyHudInput } from '~/services/sim/hudSourceAdapter'
import { normalizeAccFastState } from '~/services/sim/acc/fastStateAdapter'
import type { FastOverlayState } from '~/types/liveTelemetry'

/** One ingress for every HUD. Invalid advertised contracts cannot fall back to ACC. */
export function normalizeFastState(state: any): FastOverlayState {
  const common = readCommonLive(state?.live ?? state)
  if (!common && (state?.schema || state?.game_id)) return { ...EMPTY_FAST_STATE }
  if ((state?.live || state?.schema === 'racercore.live') && !common) return { ...EMPTY_FAST_STATE }
  if (common && !common.connected) return { ...EMPTY_FAST_STATE, commonLive: common }
  if (common && (!usesLegacyHudInput(common) || state.schema === 'racercore.live')) return { ...EMPTY_FAST_STATE, ...commonFastPresentation(common) }
  return normalizeAccFastState(state, common)
}
