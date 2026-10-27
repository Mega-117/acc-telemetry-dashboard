// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { initialLocale, LOCALE_STORAGE_KEY, missingKeys, setLocale, translate, useI18n } from '~/i18n'

describe('i18n', () => {
  it('keeps English complete: every Italian key has an English text', () => {
    expect(missingKeys('en')).toEqual([])
  })

  it('picks the saved language, else the system one (Italian stays Italian, the rest English)', () => {
    expect(initialLocale('en', 'it-IT')).toBe('en')
    expect(initialLocale(null, 'it-IT')).toBe('it')
    expect(initialLocale(null, 'de-DE')).toBe('en')
    expect(initialLocale('fr', 'it')).toBe('it')
  })

  it('translates, fills placeholders and falls back to the key only when nothing exists', () => {
    expect(translate('it', 'nav.sessions')).toBe('SESSIONI')
    expect(translate('en', 'nav.sessions')).toBe('SESSIONS')
    expect(translate('en', 'missing.key' as never)).toBe('missing.key')
    expect(translate('it', 'nav.back')).toBe('Indietro')
  })

  it('switches reactively, saves the choice and updates the document language', () => {
    const { t, locale } = useI18n()
    setLocale('en')
    expect(locale.value).toBe('en')
    expect(t('userMenu.logout')).toBe('Log out')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    setLocale('it')
    expect(t('userMenu.logout')).toBe('Esci')
  })
})
