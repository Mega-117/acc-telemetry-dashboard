import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Owner (28/10): the Sectors classic and Tyres classic outer panels take the Info "style A" shape:
// square corners, only the top-right corner cut, the border drawn back on the cut and the yellow
// frame following it. One shared mixin; Compact sectors and Race tyres keep their own panel.
function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

const INCLUDE = "@include hud-cut-corner(calc(14px * var(--hud-scale)), rgba(255, 255, 255, 0.15), 'hud-overlay__panel--yellow-flag', calc(4px * var(--hud-scale)));"

describe('shared cut-corner panel mixin', () => {
  const mixin = () => source('app/assets/scss/_hud-cut-corner.scss')

  it('cuts only the top-right corner of a square panel, background included', () => {
    expect(mixin()).toMatch(/@mixin hud-cut-corner\(\$cut, \$line, \$flag-class, \$flag-width\)/)
    expect(mixin()).toContain('border-radius: 0;')
    expect(mixin()).toContain('clip-path: polygon(0 0, calc(100% - var(--hud-cut)) 0, 100% var(--hud-cut), 100% 100%, 0 100%);')
    // overflow: hidden would clip the diagonal line and the outer frame at the padding box.
    expect(mixin()).toContain('overflow: visible;')
  })

  it('draws the border back on the cut with the Info 45° line', () => {
    expect(mixin()).toMatch(/> \.hud-cut-corner__line \{[^}]*position: absolute;[^}]*z-index: 16;[^}]*top: -1px;[^}]*left: calc\(100% \+ 1px - var\(--hud-cut\)\);[^}]*width: calc\(var\(--hud-cut\) \* 1\.4142\);[^}]*height: 1px;[^}]*background: \$line;[^}]*transform: rotate\(45deg\);[^}]*transform-origin: 0 0;[^}]*pointer-events: none;/)
  })

  it('moves the yellow frame onto the outer edge and widens the diagonal to the frame width', () => {
    expect(mixin()).toMatch(/&\.#\{\$flag-class\}::after \{[^}]*inset: -1px;[^}]*border-radius: 0;/)
    expect(mixin()).toMatch(/&\.#\{\$flag-class\} > \.hud-cut-corner__line \{[^}]*height: \$flag-width;[^}]*background: #ffd400;/)
  })
})

describe('Sectors classic panel', () => {
  it('uses the cut shape and the line only in Classic, keeping the background contract', () => {
    const page = source('app/pages/sectors-overlay.vue')
    const styles = source('app/assets/scss/components/sectors-overlay.scss')

    expect(page).toContain("'hud-overlay__panel--classic': variant !== 'compact',")
    expect(page).toContain('<i v-if="variant !== \'compact\'" class="hud-cut-corner__line" aria-hidden="true" />')
    expect(styles).toContain("@use '~/assets/scss/hud-cut-corner' as *;")
    expect(styles).toMatch(new RegExp(String.raw`\.hud-overlay__panel--classic \{\s*${INCLUDE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*\}`))
    // Compact keeps its rounded panel; the opacity still reaches only the panel background.
    expect(styles).toMatch(/\.hud-overlay__panel--compact \{[^}]*border-radius: calc\(12px \* var\(--hud-scale\)\);/)
    expect(styles).toContain('background: rgba(13, 14, 18, var(--hud-sectors-bg-opacity, 1));')
  })
})

describe('Tyres classic panel', () => {
  it('uses the cut shape and the line only in Classic; Race and the four cards are unchanged', () => {
    const page = source('app/pages/tyres-overlay.vue')

    expect(page).toContain("'hud-overlay__panel--classic': variant === 'classic',")
    expect(page).toContain('<i v-if="variant === \'classic\'" class="hud-cut-corner__line" aria-hidden="true" />')
    expect(page).toContain("@use '~/assets/scss/hud-cut-corner' as *;")
    expect(page).toContain(`.hud-overlay__panel--classic {\n  ${INCLUDE}\n}`)
    expect(page).toMatch(/\.hud-overlay__panel--race \{[^}]*border-radius: calc\(12px \* var\(--hud-scale\)\);/)
    expect(page).toMatch(/\.hud-overlay \.tyre-slip \{[^}]*clip-path: polygon\(0 0, calc\(100% - var\(--tyre-slip-cut\)\) 0/)
  })
})
