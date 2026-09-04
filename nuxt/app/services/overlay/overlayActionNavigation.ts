export interface OverlayActivationDecision {
  selectedId: string | null
  activateId: string | null
}

export function firstOverlayActionId(availableIds: string[]): string | null {
  return availableIds[0] ?? null
}

export function nextOverlayActionId(currentId: string | null, availableIds: string[]): string | null {
  if (availableIds.length === 0) return null
  const currentIndex = currentId ? availableIds.indexOf(currentId) : -1
  if (currentIndex < 0) return availableIds[0] ?? null
  return availableIds[(currentIndex + 1) % availableIds.length] ?? null
}

export function resolveOverlayActivation(
  currentId: string | null,
  availableIds: string[],
): OverlayActivationDecision {
  const firstId = firstOverlayActionId(availableIds)
  if (!currentId || !availableIds.includes(currentId)) {
    return { selectedId: firstId, activateId: null }
  }
  return { selectedId: currentId, activateId: currentId }
}
