import { describe, expect, it } from 'vitest'

import { emailDomainHintMessage, suggestEmailDomain } from '~/utils/emailDomainHint'

describe('suggestEmailDomain', () => {
  it.each([
    ['popogino117@gmail.co', 'gmail.com'],
    ['pilota@gmial.com', 'gmail.com'],
    ['pilota@gmail.con', 'gmail.com'],
    ['pilota@hotmial.it', 'hotmail.it'],
    ['pilota@outlok.it', 'outlook.it']
  ])('suggests the intended domain for %s', (email, expected) => {
    expect(suggestEmailDomain(email)).toBe(expected)
  })

  it('is case insensitive and tolerates surrounding spaces', () => {
    expect(suggestEmailDomain('  PILOTA@GMAIL.CO  ')).toBe('gmail.com')
  })

  // Il rischio vero di questa funzione non e' mancare un refuso: e' gridare al
  // lupo su indirizzi corretti, finche' l'utente smette di leggere l'avviso.
  it.each([
    'pilota@gmail.com',
    'pilota@hotmail.it',
    'pilota@hotmail.com',
    'pilota@outlook.it',
    'pilota@libero.it',
    'pilota@email.it',
    'pilota@tiscali.it'
  ])('stays silent on the known domain %s', (email) => {
    expect(suggestEmailDomain(email)).toBeNull()
  })

  it('stays silent on a legitimate domain that resembles nothing known', () => {
    expect(suggestEmailDomain('pilota@scuderia-rossa.it')).toBeNull()
    expect(suggestEmailDomain('pilota@acc-suite.dev')).toBeNull()
  })

  it('does not suggest a short domain on the strength of two edits alone', () => {
    // `me.com` e' noto e corto: due modifiche sarebbero troppe per dedurlo, e
    // trasformerebbero domini legittimi in falsi allarmi.
    expect(suggestEmailDomain('pilota@go.com')).toBeNull()
  })

  it.each([
    '',
    '   ',
    'senza-chiocciola',
    'pilota@',
    '@gmail.com',
    'pilota@dominio-senza-punto'
  ])('returns null for the incomplete input %s', (email) => {
    expect(suggestEmailDomain(email)).toBeNull()
  })
})

describe('emailDomainHintMessage', () => {
  it('names the correct domain', () => {
    expect(emailDomainHintMessage('popogino117@gmail.co')).toBe(
      'Controlla il dominio: forse intendevi @gmail.com?'
    )
  })

  it('never echoes the address being typed', () => {
    const message = emailDomainHintMessage('popogino117@gmail.co')

    // L'avviso deve poter comparire su qualsiasi schermata senza rimettere in
    // pagina l'indirizzo digitato: nomina il dominio corretto e nient'altro.
    expect(message).not.toContain('popogino117')
    expect(message).not.toContain('@gmail.co?')
  })

  it('returns null when there is nothing worth saying', () => {
    expect(emailDomainHintMessage('pilota@gmail.com')).toBeNull()
  })
})
