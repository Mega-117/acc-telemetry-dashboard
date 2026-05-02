export function isDevToolsHost(hostname?: string | null): boolean {
  const host = String(
    hostname ||
    (typeof window !== 'undefined' ? window.location.hostname : '')
  ).toLowerCase()

  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

export function canUseDevTools(hostname?: string | null): boolean {
  return import.meta.dev || isDevToolsHost(hostname)
}
