// PIP-638: noindex di default, indicizzabile solo con l'interruttore esplicito.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SITE_INDEXABLE_ENV, siteIndexable, siteRobotsMeta } from '../../shared/siteIndexing'

describe('siteIndexing', () => {
  it('keeps the site out of search engines unless the switch is on', () => {
    expect(siteRobotsMeta({})).toEqual({ name: 'robots', content: 'noindex, nofollow' })
    expect(siteRobotsMeta({ [SITE_INDEXABLE_ENV]: '0' })).not.toBeNull()
    expect(siteRobotsMeta({ [SITE_INDEXABLE_ENV]: 'true' })).not.toBeNull()
    expect(siteIndexable({ [SITE_INDEXABLE_ENV]: '1' })).toBe(true)
    expect(siteRobotsMeta({ [SITE_INDEXABLE_ENV]: '1' })).toBeNull()
  })

  it('is wired into the head of every page by the Nuxt config', () => {
    const config = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
    expect(config).toContain("import { siteRobotsMeta } from './shared/siteIndexing'")
    expect(config).toContain('...(robotsMeta ? [robotsMeta] : [])')
  })
})
