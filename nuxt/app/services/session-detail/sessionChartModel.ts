export function buildSessionChartDomain(times: number[]) {
  if (!times.length) {
    return { min: 0, max: 120 }
  }
  return {
    min: Math.min(...times) - 0.5,
    max: Math.max(...times) + 0.5
  }
}
