// PIP-658: the versions of the beta Terms and Privacy notice, one place. They match the date shown in
// public/legal/termini.html and public/legal/privacy.html: when a text changes, change both here and there.
export const TERMS_VERSION = '2026-10-27'
export const PRIVACY_VERSION = '2026-10-27'

/** What registration stores in `users/{uid}.consent` (Firestore rules: validConsent). */
export type RegisterConsent = { termsVersion: string; privacyVersion: string; acceptedAt: string }

/** Absolute-to-site URL of a legal page, under the app base (Pages serves the app below /docs/). */
export function legalPageUrl(page: 'privacy' | 'termini', baseURL = '/'): string {
  return `${baseURL.endsWith('/') ? baseURL : `${baseURL}/`}legal/${page}.html`
}

/** True when the stored acceptance is for the current texts (an older version asks again). */
export function hasCurrentConsent(consent: { termsVersion?: unknown, privacyVersion?: unknown } | null | undefined): boolean {
  return consent?.termsVersion === TERMS_VERSION && consent?.privacyVersion === PRIVACY_VERSION
}
