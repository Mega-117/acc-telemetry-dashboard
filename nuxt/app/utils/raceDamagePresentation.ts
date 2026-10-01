// ACC Drive damage converters use raw body points (150) and suspension % (100).
export function raceDamageColor(value: number | null | undefined, max = 150, total = false, stroke = false): string {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(value!, max)) : 0
  if (!v) return stroke ? '#808080' : total ? '#ffffff' : 'rgba(255,255,255,0)'
  let alpha = 255
  let green = total ? 128 : 0
  if (v <= max * .33) {
    alpha = total ? 255 : Math.trunc(100 + 100 * v / (max * .33))
    green = Math.trunc(Math.max(total ? 128 : 0, 255 - v / (max * .33) * 255))
  } else if (v <= max * .66) {
    alpha = total ? 255 : Math.trunc(200 + 55 * (v - max * .33) / (max * .33))
  } else if (stroke) {
    alpha = Math.trunc(255 - 55 * (v - max * .66) / (max * .34))
  }
  return `rgba(${stroke ? 102 : 255},${stroke ? Math.trunc(green * .4) : green},0,${alpha / 255})`
}

export function raceDamageZoneTime(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return `--:--.${'-'.repeat(digits)}`
  const ms = Math.max(0, Math.trunc(value))
  return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0').slice(0, digits)}`
}
