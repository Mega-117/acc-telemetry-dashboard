// PIP-658: the user's choice on automatic technical diagnostics, handed to the desktop program. With it off
// the program keeps its packages on the PC (they are sent only with "Segnala problema"). In a browser there
// is nothing to send: it does nothing.
type Bridge = { setDiagnosticsConsent?: (enabled: boolean) => void }

export function setDesktopDiagnosticsConsent(enabled: boolean) {
  try { (typeof window === 'undefined' ? null : (window as Window & { electronAPI?: Bridge }).electronAPI)?.setDiagnosticsConsent?.(enabled === true) } catch { /* never disturb the page */ }
}
