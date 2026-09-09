import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('program favicon', () => {
  it.each([
    ['development', '/'],
    ['production', '/acc-telemetry-dashboard/docs/']
  ])('uses the approved ICO with the correct base path in %s', async (environment, base) => {
    vi.stubEnv('NODE_ENV', environment)
    vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
    vi.resetModules()
    const { default: config } = await import('../../nuxt.config')
    const icon = readFileSync(new URL('../../public/favicon.ico', import.meta.url))
    const docsIcon = readFileSync(new URL('../../../docs/favicon.ico', import.meta.url))
    expect(icon.equals(docsIcon)).toBe(true)
    expect(icon.readUInt16LE(2)).toBe(1)
    const revision = createHash('sha256').update(icon).digest('hex').slice(0, 12)
    expect(config.app?.head?.link).toContainEqual({
      rel: 'icon', type: 'image/x-icon', href: `${base}favicon.ico?v=${revision}`
    })
  })
})
