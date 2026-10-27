// PIP-665: interface language. One small module instead of a library: Italian is the source
// and the fallback, English fills what it has. Only visible text is translated, never ids,
// IPC commands, event names or stored values.
import { computed, ref } from 'vue'
import it from './it'
import en from './en'
import type { TranslationKey } from './types'

export type Locale = 'it' | 'en'
export const LOCALES: readonly { id: Locale, name: string }[] = [{ id: 'it', name: 'Italiano' }, { id: 'en', name: 'English' }]
export const LOCALE_STORAGE_KEY = 'rc:locale'

type Tree = { [key: string]: string | Tree }
export type { Dictionary, PartialDictionary, TranslationKey } from './types'

const DICTIONARIES: Record<Locale, Tree> = { it: it as Tree, en: en as Tree }
const isLocale = (value: unknown): value is Locale => value === 'it' || value === 'en'

/**
 * Saved choice first. Someone who already used the app before languages existed stays Italian
 * (an English Windows must not switch them); a first run follows the system language.
 */
export function initialLocale(saved: string | null | undefined, systemLanguage: string | null | undefined, usedBefore = false): Locale {
  if (isLocale(saved)) return saved
  if (usedBefore) return 'it'
  return String(systemLanguage ?? 'it').toLowerCase().startsWith('it') ? 'it' : 'en'
}

function readStored(): { saved: string | null, usedBefore: boolean } {
  try {
    if (typeof localStorage === 'undefined') return { saved: null, usedBefore: false }
    let usedBefore = false
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith('rc:')) { usedBefore = true; break }
    return { saved: localStorage.getItem(LOCALE_STORAGE_KEY), usedBefore }
  } catch { return { saved: null, usedBefore: false } }
}
const stored = readStored()
const locale = ref<Locale>(initialLocale(stored.saved, typeof navigator === 'undefined' ? 'it' : navigator.language, stored.usedBefore))

type LocaleBridge = { setUiLocale?: (locale: Locale) => void }
/** The desktop program shows a few texts itself (Windows notifications): it follows the same choice. */
export function syncDesktopLocale() {
  try { (globalThis as { electronAPI?: LocaleBridge }).electronAPI?.setUiLocale?.(locale.value) } catch { /* Browser or older program. */ }
}

function lookup(tree: Tree, key: string): string | undefined {
  let node: string | Tree | undefined = tree
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/** Text for a key in a locale, Italian when the locale lacks it; `{name}` placeholders filled from params. */
export function translate(target: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  const text = lookup(DICTIONARIES[target], key) ?? lookup(DICTIONARIES.it, key) ?? key
  return params ? text.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match) : text
}

export function setLocale(next: Locale) {
  if (!isLocale(next)) return
  locale.value = next
  try { localStorage.setItem(LOCALE_STORAGE_KEY, next) } catch { /* Storage can be disabled. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = next
  syncDesktopLocale()
}

/** Reactive translator for components: `t('nav.sessions')` follows the language switch. */
export function useI18n() {
  return {
    locale: computed(() => locale.value),
    t: (key: TranslationKey, params?: Record<string, string | number>) => translate(locale.value, key, params),
    setLocale,
    /** BCP 47 tag for dates and numbers. */
    intlLocale: computed(() => locale.value === 'en' ? 'en-GB' : 'it-IT'),
  }
}

/** Keys of the Italian dictionary missing in another one (the test keeps English complete). */
export function missingKeys(target: Locale): string[] {
  const missing: string[] = []
  const walk = (source: Tree, other: Tree | undefined, prefix: string) => {
    for (const [key, value] of Object.entries(source)) {
      const next = other?.[key]
      if (typeof value === 'string') { if (typeof next !== 'string' || !next.trim()) missing.push(prefix + key) }
      else walk(value, typeof next === 'object' ? next : undefined, `${prefix}${key}.`)
    }
  }
  walk(DICTIONARIES.it, DICTIONARIES[target], '')
  return missing
}
