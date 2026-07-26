import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Info Target setup layout contract', () => {
  it('keeps tolerance separate from the three-part time picker', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoTargetSetup.vue'), 'utf8')

    expect(source).toContain('v-for="control in timeControls"')
    expect(source).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(source).toContain('<section class="target-tolerance"')
    expect(source).toContain('Margine concesso oltre il target. I giri più veloci restano validi.')
    expect(source).toContain('@wheel.prevent="onWheel(toleranceControl, $event)"')
  })
})