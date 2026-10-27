import { useI18n } from '~/i18n'

export const GAME_OPTIONS = [
  { id: 'acc', label: 'ACC', name: 'Assetto Corsa Competizione', available: true, experimental: false },
  { id: 'evo', label: 'Assetto Corsa EVO', name: 'Assetto Corsa EVO', available: true, experimental: true },
] as const

export function gameLogo(gameId: string): string | null {
  return gameId === 'acc' || gameId === 'evo' ? `/images/games/${gameId}.png` : null
}

export function gameLabel(gameId: string | null | undefined): string {
  const { t } = useI18n()
  if (gameId === 'synthetic') return t('game.syntheticDev')
  return GAME_OPTIONS.find(game => game.id === gameId)?.label || gameId || t('game.unknown')
}

export type SimulatorConnection = { state: 'connected' | 'started' | 'choice' | 'none'; gameId: string | null; label: string }

/** PIP-510: one reading of the simulator state for the webapp selector and Ctrl+K.
 *  connected = driving data flows; started = game open (menus/lobby/loading). */
export function simulatorConnection(live: { gameId: string; connected: boolean; fresh: boolean; running?: boolean; choiceRequired?: boolean } | null | undefined): SimulatorConnection {
  // readCommonLive already folds freshness into `connected`. `label` is display only: callers branch on `state`.
  const { t } = useI18n()
  if (live?.connected) return { state: 'connected', gameId: live.gameId, label: t('game.connected', { game: gameLabel(live.gameId) }) }
  if (live?.running && GAME_OPTIONS.some(game => game.id === live.gameId)) {
    return { state: 'started', gameId: live.gameId, label: t('game.started', { game: gameLabel(live.gameId) }) }
  }
  if (live?.choiceRequired) return { state: 'choice', gameId: null, label: t('game.choose') }
  return { state: 'none', gameId: null, label: t('game.none') }
}

// Product support is stable while disconnected. Live availability remains a
// separate measurement/capability check; never infer ACC from an unknown game.
export function gameUiSupport(gameId: string | null | undefined) {
  const full = gameId === 'acc'
  return { pitwall: full, adaptiveCoach: full, pressureAdvice: full,
    quickAutomations: full, quickVoiceControls: full || gameId === 'evo',
    extendedVoiceControls: full, quickSectorReferences: full, fullStandings: full,
    mapOptions: full }
}

export function hudSettingSupported(gameId: string, overlay: string, key: string): boolean {
  if (gameId === 'acc') return true
  if (gameId !== 'evo') return false
  if (overlay === 'info') return ['showStint', 'showFuelLeft', 'showDelta', 'showGrip', 'showBest', 'showTime'].includes(key)
  if (overlay === 'standings') return ['showFastestLap', 'showLastLap', 'showLapProgressBar'].includes(key)
  return false
}
