// PIP-658: the versions of the beta Terms and Privacy notice, one place. They match the date shown in
// public/legal/termini.html and public/legal/privacy.html: when a text changes, change both here and there.
export const TERMS_VERSION = '2026-10-31'
export const PRIVACY_VERSION = '2026-10-31'
// PIP-694 (user decision 31/10/2026): who accepted the 27/10 texts counts as having accepted these ones;
// they are not asked again. Add a version here only on such a decision.
const ACCEPTED_AS_CURRENT = new Set(['2026-10-27'])

/** What registration stores in `users/{uid}.consent` (Firestore rules: validConsent). */
/** `usage`: the optional usage-statistics box (PIP-698), applied once at the first entry (RegistrationUsageChoice). */
export type RegisterConsent = { termsVersion: string; privacyVersion: string; acceptedAt: string; usage?: boolean }

// 01/11: English texts of the same version (terms.html, privacy-en.html); the Italian text prevails.
const ENGLISH_PAGES = { privacy: 'privacy-en', termini: 'terms' } as const

/** Absolute-to-site URL of a legal page, under the app base (Pages serves the app below /docs/), in the UI language. */
export function legalPageUrl(page: 'privacy' | 'termini', baseURL = '/', locale: 'it' | 'en' = 'it'): string {
  const file = locale === 'en' ? ENGLISH_PAGES[page] : page
  return `${baseURL.endsWith('/') ? baseURL : `${baseURL}/`}legal/${file}.html`
}

/** True when the stored acceptance is for the current texts (an older version asks again). */
export function hasCurrentConsent(consent: { termsVersion?: unknown, privacyVersion?: unknown } | null | undefined): boolean {
  const current = (value: unknown, version: string) => value === version || (typeof value === 'string' && ACCEPTED_AS_CURRENT.has(value))
  return current(consent?.termsVersion, TERMS_VERSION) && current(consent?.privacyVersion, PRIVACY_VERSION)
}
