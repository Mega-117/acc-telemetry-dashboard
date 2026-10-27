// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { initialLocale, LOCALE_STORAGE_KEY, missingKeys, setLocale, translate, useI18n } from '~/i18n'
import { translateAuthError } from '~/services/auth/authService'
import { commandErrorText } from '~/services/controls/commandCapture'
import { formatWheelBinding } from '~/services/controls/wheelBindingModel'
import { emailDomainHintMessage } from '~/utils/emailDomainHint'

describe('i18n', () => {
  it('keeps English complete: every Italian key has an English text', () => {
    expect(missingKeys('en')).toEqual([])
  })

  it('picks the saved language, else the system one (Italian stays Italian, the rest English)', () => {
    expect(initialLocale('en', 'it-IT')).toBe('en')
    expect(initialLocale(null, 'it-IT')).toBe('it')
    expect(initialLocale(null, 'de-DE')).toBe('en')
    expect(initialLocale('fr', 'it')).toBe('it')
    // Someone who used the app before languages existed stays Italian on an English system.
    expect(initialLocale(null, 'en-US', true)).toBe('it')
    expect(initialLocale('en', 'it-IT', true)).toBe('en')
  })

  it('translates, fills placeholders and falls back to the key only when nothing exists', () => {
    expect(translate('it', 'nav.sessions')).toBe('SESSIONI')
    expect(translate('en', 'nav.sessions')).toBe('SESSIONS')
    expect(translate('en', 'missing.key' as never)).toBe('missing.key')
    expect(translate('it', 'nav.back')).toBe('Indietro')
  })

  it('switches reactively, saves the choice and updates the document language', () => {
    const { t, locale } = useI18n()
    const sent: string[] = []
    ;(window as unknown as { electronAPI: unknown }).electronAPI = { setUiLocale: (value: string) => sent.push(value) }
    setLocale('en')
    expect(locale.value).toBe('en')
    expect(t('userMenu.logout')).toBe('Log out')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(sent).toEqual(['en'])
    setLocale('it')
    expect(t('userMenu.logout')).toBe('Esci')
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('gives first-run messages from services in the interface language, keeping codes unchanged', () => {
    setLocale('en')
    expect(translateAuthError('auth/too-many-requests')).toBe('Too many attempts, try again later')
    expect(emailDomainHintMessage('pilot@gmail.co')).toBe('Check the domain: did you mean @gmail.com?')
    expect(commandErrorText('binding_conflict')).toBe('This button is already assigned to another command.')
    expect(formatWheelBinding(null)).toBe('Not assigned')
    setLocale('it')
    expect(translateAuthError('auth/too-many-requests')).toBe('Troppi tentativi, riprova piu tardi')
    expect(commandErrorText('mystery')).toBe('Comando non salvato. Riprova.')
  })
})
