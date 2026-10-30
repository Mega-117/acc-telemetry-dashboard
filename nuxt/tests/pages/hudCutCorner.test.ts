import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// PIP-671 (approved drafts 30/10): every restyled HUD draws its outline with one shared mixin. The
// frame and the yellow-flag frame are rings (outline minus the outline inset by the ring width), so
// they follow the whole contour, cut corners included, with no separate diagonal line.
function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('shared HUD outline mixin', () => {
  const mixin = () => source('app/assets/scss/_hud-cut-corner.scss')

  it('cuts the chosen top corners of a square panel, background included', () => {
    expect(mixin()).toMatch(/@mixin hud-cut-corner\(\$left-cut, \$right-cut, \$width, \$color, \$flag-class, \$flag-width\)/)
    expect(mixin()).toContain('border-radius: 0;')
    expect(mixin()).toContain('clip-path: polygon(#{hud-outline($left-cut, $right-cut, 0px)});')
    // A 45° cut inset by w moves its ends by w * (√2 - 1) along the edges.
    expect(mixin()).toContain('$l: calc(#{$left-cut} + #{$inset} * 0.4142);')
    expect(mixin()).toContain('$r: calc(#{$right-cut} + #{$inset} * 0.4142);')
    expect(mixin()).toContain('overflow: visible;')
  })

  it('draws the frame and the yellow flag frame as even-odd rings along the whole outline', () => {
    // Both loops closed explicitly, so the bridge between them has no area and never cuts a wedge
    // out of the left edge (owner 30/10: the frame faded in the middle of the left side).
    expect(mixin()).toContain('@return polygon(evenodd, #{$outer}, #{nth($outer, 1)}, #{$inner}, #{nth($inner, 1)});')
    expect(mixin()).toMatch(/&::before \{[^}]*z-index: 14;[^}]*background: \$color;[^}]*clip-path: hud-ring\(\$left-cut, \$right-cut, \$width\);/)
    expect(mixin()).toMatch(/&\.#\{\$flag-class\}::after \{[^}]*z-index: 15;[^}]*background: #ffd400;[^}]*clip-path: hud-ring\(\$left-cut, \$right-cut, \$flag-width\);/)
    // No separate line on the cut any more.
    expect(mixin()).not.toContain('hud-cut-corner__line')
  })

  it('no restyled HUD keeps the old diagonal line element', () => {
    for (const file of [
      'app/components/overlay/DashboardHud.vue',
      'app/components/overlay/InfoHud.vue',
      'app/pages/sectors-overlay.vue',
      'app/pages/tyres-overlay.vue',
    ]) {
      expect(source(file)).not.toContain('hud-cut-corner__line')
      expect(source(file)).not.toContain('info-hud__cut')
    }
  })
})

describe('draft shapes per HUD', () => {
  it('Dashboard: both top corners cut, hairline frame, 4px yellow frame', () => {
    expect(source('app/assets/scss/components/dashboard-hud.scss'))
      .toContain("@include hud-cut-corner(14px, 14px, $hud-hairline-width, $hud-hairline-color, 'dash-hud--yellow-flag', $hud-flag-width);")
  })

  it('Info: only the top-right corner cut, hairline frame', () => {
    expect(source('app/components/overlay/InfoHud.vue'))
      .toContain("@include hud-cut-corner(0px, 14px, $hud-hairline-width, $hud-hairline-color, 'info-hud--yellow-flag', $hud-flag-width);")
  })

  it('Sectors (Classic and Compact): square panel, hairline frame', () => {
    const styles = source('app/assets/scss/components/sectors-overlay.scss')
    expect(styles).toContain("@include hud-cut-corner(0px, 0px, $hud-hairline-width, $hud-hairline-color, 'hud-overlay__panel--yellow-flag', $hud-flag-width);")
    expect(styles).toContain('background: rgba(9, 12, 16, var(--hud-sectors-bg-opacity, 1));')
  })

  it('Tyres: Race square with a hairline frame, no damage frame; Classic keeps its top-right cut', () => {
    const page = source('app/pages/tyres-overlay.vue')
    expect(page).toContain("@include hud-cut-corner(0px, 0px, var(--hud-frame-width), var(--hud-frame), 'hud-overlay__panel--yellow-flag', $hud-flag-width);")
    // Owner (30/10): damage colours only the middle strip lines, never the panel frame.
    expect(page).not.toContain(':has(.tyre-race--damaged)')
    // Owner (30/10): the tyres page is as tall as the Damage page, so switching never resizes.
    expect(page).toContain('height: 660px;')
    expect(page).toContain('--hud-frame: #{$hud-hairline-color};')
    expect(page).toContain("@include hud-cut-corner(0px, calc(14px * var(--hud-scale)), $hud-hairline-width, $hud-hairline-color, 'hud-overlay__panel--yellow-flag', $hud-flag-width);")
    // Style guide (28/10): the four Classic tiles are flat, with no cut of their own.
    expect(page).toMatch(/\.hud-overlay \.tyre-slip \{[^}]*border: 0;/)
    expect(page).not.toMatch(/\.hud-overlay \.tyre-slip \{[^}]*clip-path/)
  })

  it('the Damage drawing inside the Race window is unchanged', () => {
    const damage = source('app/components/overlay/DamageRaceHud.vue')
    expect(damage).not.toMatch(/<rect[^>]*width="166" height="241"[^>]*rx=/)
    expect(damage).toContain('<rect v-if="fastState.flag === 2" x="1" y="1" width="164" height="239" rx="8" fill="none" stroke="#ffd400" stroke-width="1.5" />')
  })
})
