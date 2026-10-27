import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRIVACY_VERSION, TERMS_VERSION, hasCurrentConsent, legalPageUrl } from '~/utils/legalVersions'

describe('legal versions (PIP-658)', () => {
  it('builds the page URL under the app base', () => {
    expect(legalPageUrl('privacy', '/acc-telemetry-dashboard/docs/')).toBe('/acc-telemetry-dashboard/docs/legal/privacy.html')
    expect(legalPageUrl('termini', '/x')).toBe('/x/legal/termini.html')
    expect(legalPageUrl('privacy')).toBe('/legal/privacy.html')
  })
  it('asks again when either text has a newer version', () => {
    expect(hasCurrentConsent({ termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION })).toBe(true)
    expect(hasCurrentConsent({ termsVersion: '2026-01-01', privacyVersion: PRIVACY_VERSION })).toBe(false)
    expect(hasCurrentConsent(null)).toBe(false)
  })
  it('the published pages show the same versions', () => {
    const page = (name: string) => readFileSync(resolve(__dirname, `../../public/legal/${name}.html`), 'utf8')
    expect(page('privacy')).toContain(`versione ${PRIVACY_VERSION}`)
    expect(page('termini')).toContain(`versione ${TERMS_VERSION}`)
  })
})
