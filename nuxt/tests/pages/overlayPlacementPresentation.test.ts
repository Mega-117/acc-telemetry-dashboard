import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('keeps the real Control K card and its normal size during placement', () => {
  const page = readFileSync(resolve('app/pages/training-overlay.vue'), 'utf8')
  expect(page).not.toContain('class="placement-work-area')
  expect(page).not.toContain('v-show="!placementActive"')
  expect(page).not.toContain("if (placementActive.value) return 'placement'")
  expect(page).toContain('<OverlayPlacementLock overlay-id="training" />')
  expect(page).toContain("hudOverlayGetPlacement?.('training')")
})

it.each(['tyres', 'sectors', 'dashboard', 'info', 'standings', 'trackmap'])('wires the shared lock to %s', id => {
  const page = readFileSync(resolve(`app/pages/${id}-overlay.vue`), 'utf8')
  expect(page).toContain(`<OverlayPlacementLock overlay-id="${id}" />`)
})
