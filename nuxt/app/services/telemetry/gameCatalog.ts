export const GAME_OPTIONS = [
  { id: 'acc', label: 'ACC', name: 'Assetto Corsa Competizione', available: true },
  { id: 'evo', label: 'Assetto Corsa EVO', name: 'Assetto Corsa EVO', available: false },
] as const

export function gameLabel(gameId: string | null | undefined): string {
  if (gameId === 'synthetic') return 'Simulatore di test · DEV'
  return GAME_OPTIONS.find(game => game.id === gameId)?.label || gameId || 'Gioco sconosciuto'
}
