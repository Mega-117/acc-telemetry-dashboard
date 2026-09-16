import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(new URL(`../../app/${path}`, import.meta.url), 'utf8')

describe('official app background boundary', () => {
  it('mounts once outside page transitions and excludes transparent runtime windows', () => {
    const app = source('app.vue')
    expect(app.match(/<UiRacingBackdrop/g)).toHaveLength(1)
    expect(app).toContain('<UiRacingBackdrop v-if="!isTrainingOverlayIntent && !isHudOverlayRoute && !isStandaloneRuntimeRoute" />')
    expect(app.indexOf('<UiRacingBackdrop')).toBeLessThan(app.indexOf('<Transition'))
    expect(source('components/auth/AuthScene.vue')).not.toContain('particles')
    expect(source('layouts/dashboard.vue')).not.toContain('UiRacingBackdrop')
  })
  it('retains the login scene motion direction, accessibility and reduced-motion fallback', () => {
    const backdrop = source('components/ui/RacingBackdrop.vue')
    expect(backdrop).toContain('aria-hidden="true"')
    expect(backdrop).toContain('pointer-events: none')
    expect(backdrop).toContain('translate3d(110px,-110px,0)')
    expect(backdrop).toContain('translate3d(-350px,350px,0)')
    expect(backdrop).toContain('prefers-reduced-motion: reduce')
    expect(backdrop).toContain('animation: none')
  })
})
