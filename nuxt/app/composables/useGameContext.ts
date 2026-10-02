import { readonly, ref } from 'vue'

// Browsing is a user choice. A connector never writes this state.
const consultedGame = ref('acc')

export function useGameContext() {
  function selectGame(gameId: string, allowDevelopment = false) {
    if (gameId !== 'acc' && gameId !== 'evo' && !(gameId === 'synthetic' && import.meta.env.DEV && allowDevelopment)) return
    consultedGame.value = gameId
  }
  return { consultedGame: readonly(consultedGame), selectGame }
}
