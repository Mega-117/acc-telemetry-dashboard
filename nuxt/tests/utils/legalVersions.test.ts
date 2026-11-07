import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRIVACY_VERSION, TERMS_VERSION, hasCurrentConsent, legalPageUrl } from '~/utils/legalVersions'

describe('legal versions (PIP-658)', () => {
  it('builds the page URL under the app base', () => {
    expect(legalPageUrl('privacy', '/acc-telemetry-dashboard/docs/')).toBe('/acc-telemetry-dashboard/docs/legal/privacy.html')
    expect(legalPageUrl('termini', '/x')).toBe('/x/legal/termini.html')
    expect(legalPageUrl('privacy')).toBe('/legal/privacy.html')
    // 01/11: English texts for the English interface.
    expect(legalPageUrl('privacy', '/', 'en')).toBe('/legal/privacy-en.html')
    expect(legalPageUrl('termini', '/x/', 'en')).toBe('/x/legal/terms.html')
  })
  it('points the installed app (racercore: protocol) to the public site, which the system browser can open', () => {
    expect(legalPageUrl('termini', '/', 'it', 'racercore:')).toBe('https://app.racercore.app/legal/termini.html')
    expect(legalPageUrl('privacy', '/', 'en', 'file:')).toBe('https://app.racercore.app/legal/privacy-en.html')
    // A web page (site, Nuxt dev) keeps its own address.
    expect(legalPageUrl('privacy', '/', 'it', 'https:')).toBe('/legal/privacy.html')
    expect(legalPageUrl('privacy', '/', 'it', 'http:')).toBe('/legal/privacy.html')
  })
  it('asks again when either text has a newer version', () => {
    expect(hasCurrentConsent({ termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION })).toBe(true)
    expect(hasCurrentConsent({ termsVersion: '2026-01-01', privacyVersion: PRIVACY_VERSION })).toBe(false)
    expect(hasCurrentConsent(null)).toBe(false)
  })
  it('PIP-694: the 27/10 acceptance counts as current (decision 31/10: existing drivers are not asked again)', () => {
    expect(hasCurrentConsent({ termsVersion: '2026-10-27', privacyVersion: '2026-10-27' })).toBe(true)
    expect(hasCurrentConsent({ termsVersion: '2026-10-27', privacyVersion: PRIVACY_VERSION })).toBe(true)
  })
  it('PIP-694: laps and sessions are visible to other drivers by signing up, kept while the account exists', () => {
    const privacy = readFileSync(resolve(__dirname, '../../public/legal/privacy.html'), 'utf8')
    expect(privacy).toContain('lo accetti registrandoti')
    expect(privacy).not.toContain('Solo se la attivi')
    expect(privacy).not.toContain('Archivio online 30 giorni')
  })
  it('the published pages show the same versions', () => {
    const page = (name: string) => readFileSync(resolve(__dirname, `../../public/legal/${name}.html`), 'utf8')
    expect(page('privacy')).toContain(`versione ${PRIVACY_VERSION}`)
    expect(page('termini')).toContain(`versione ${TERMS_VERSION}`)
    // 01/11: official texts (no draft notice), English twins of the same version.
    expect(page('privacy-en')).toContain(`version ${PRIVACY_VERSION}`)
    expect(page('terms')).toContain(`version ${TERMS_VERSION}`)
    for (const name of ['privacy', 'termini', 'privacy-en', 'terms']) expect(page(name)).not.toMatch(/bozza|draft/i)
  })
  it('decision 27/10: diagnostics are necessary (legitimate interest, 30 days); usage statistics stay optional', () => {
    const privacy = readFileSync(resolve(__dirname, '../../public/legal/privacy.html'), 'utf8')
    expect(privacy).toMatch(/Diagnostica tecnica[^<]*<\/td><td>Necessaria al funzionamento[^<]*<\/td><td>Al massimo 30 giorni/)
    expect(privacy).toContain('legittimo interesse')
    expect(privacy).toContain('Le puoi spegnere')
    expect(privacy).not.toMatch(/scegli se attivare[^.]*diagnostica/)
  })
})
