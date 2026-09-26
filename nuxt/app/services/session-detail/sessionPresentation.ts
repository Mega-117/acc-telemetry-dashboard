/** Display-only labels and markers. Never changes lap eligibility or timing. */
export function stintTypeLabel(type?: string): string {
  return type === 'R' ? 'Gara' : type === 'Q' ? 'Qualifica' : (type || '—')
}

export function gripAbbreviation(grip?: string): string {
  const labels: Record<string, string> = {
    optimum: 'OPT', opt: 'OPT', fast: 'FAST', green: 'GRN',
    greasy: 'GRS', damp: 'DAMP', wet: 'WET', flooded: 'FLD'
  }
  return grip ? labels[grip.toLowerCase()] || grip : '—'
}

export function lapPointAppearance(lap: { valid: boolean }) {
  return { shape: 'circle' as const, color: lap.valid ? '#10b981' : '#ef4444' }
}
