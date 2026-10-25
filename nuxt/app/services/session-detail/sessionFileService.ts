export function canShareOwnedSession(currentOwner: string | undefined, viewedOwner?: string | null): boolean {
  return !!currentOwner && (!viewedOwner || viewedOwner === currentOwner)
}
