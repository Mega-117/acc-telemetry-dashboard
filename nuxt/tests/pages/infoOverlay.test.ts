import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Info overlay window contract', () => {
  it('exposes a draggable Electron app region for HUD placement mode', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/pages/info-overlay.vue'), 'utf8')

    expect(source).toMatch(
      /\.overlay-root\{[^}]*-webkit-app-region:\s*drag[^}]*\}/s,
    )
    expect(source).toMatch(
      /\.overlay-canvas\{[^}]*-webkit-app-region:\s*drag[^}]*\}/s,
    )
  })
})
