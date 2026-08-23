const TECHNICAL_NETWORK_FAILURE = /^(fetch failed|failed to fetch|networkerror|econn(?:refused|reset|aborted)|enotfound)\b/i

export function presentVoiceRuntimeMessage(
  value: unknown,
  fallback = 'Motore vocale non disponibile.',
) {
  const message = typeof value === 'string' ? value.trim() : ''
  if (!message || TECHNICAL_NETWORK_FAILURE.test(message)) return fallback
  return message
}
