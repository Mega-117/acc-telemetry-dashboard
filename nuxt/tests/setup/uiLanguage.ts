// PIP-665: the interface language follows navigator.language at first start. Node takes it from the
// machine (Italian on the developer PC, English on the CI runner), so the same test read Italian here and
// English in CI. Tests run in Italian, the reference dictionary; i18n tests pass the language explicitly.
const language = process.env.VITEST_UI_LANGUAGE || 'it-IT'
const current = (globalThis as { navigator?: Navigator }).navigator
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: new Proxy(current ?? {}, {
    get: (target, key) => key === 'language' ? language
      : key === 'languages' ? [language]
      : Reflect.get(target, key),
  }),
})
