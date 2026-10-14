import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { CommonLive } from '~/services/telemetry/commonLive'
import { simulatorConnection } from '~/services/telemetry/gameCatalog'

/** A closed game (explicit "unknown" frame from the logger) waits this long before Ctrl+K resets. */
export const GAME_CLOSED_GRACE_MS = 3000
/** Silence is not a closed game: keep the layout through stalls, reset only after a long gap. */
export const SILENCE_GRACE_MS = 30000

/**
 * PIP-510: the game shown by Ctrl+K. It follows the logger as soon as the game
 * process is open (not only when driving) and never flickers: a closed game
 * resets after 3 s, a silent source (stalled app, paused logger) keeps the last
 * game for 30 s.
 */
export function useSimulatorPresence(live: Ref<CommonLive | null | undefined>, { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const connection = computed(() => simulatorConnection(live.value))
  const held = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let goneSince: number | null = null
  const cancel = () => { if (timer !== undefined) clearTimer(timer); timer = undefined }
  watch([connection, live], () => {
    const game = connection.value.gameId
    if (game) { cancel(); goneSince = null; held.value = game; return }
    if (held.value === null) return
    const closed = live.value?.fresh === true && live.value.gameId === 'unknown'
    const delay = closed ? GAME_CLOSED_GRACE_MS : SILENCE_GRACE_MS
    const since = goneSince ?? (goneSince = now())
    cancel()
    timer = setTimer(() => { held.value = null; goneSince = null; timer = undefined }, Math.max(0, since + delay - now()))
  }, { immediate: true, flush: 'sync' })
  onBeforeUnmount(cancel)
  const gameId = computed(() => connection.value.gameId ?? held.value)
  return { connection, gameId, choiceRequired: computed(() => connection.value.state === 'choice' && !gameId.value) }
}
