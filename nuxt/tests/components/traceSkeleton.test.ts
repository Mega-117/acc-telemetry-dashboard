// @vitest-environment jsdom
// 06/11 (user): while the laps load, the Telemetria's three columns show as grey blocks at the page's height.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TraceSkeleton from '~/components/session-detail/analysis/TraceSkeleton.vue'

describe('TraceSkeleton', () => {
  it('three columns at the given height, the loading words kept for screen readers', () => {
    const view = mount(TraceSkeleton, { props: { height: 640, label: 'Caricamento giri' } })
    const root = view.get('[data-testid="trace-skeleton"]')
    expect(root.attributes('style')).toContain('height: 640px')
    expect(root.attributes('role')).toBe('status')
    expect(view.findAll('.sk-col')).toHaveLength(3)
    expect(view.findAll('.sk--chart')).toHaveLength(4)
    expect(view.get('.sr-only').text()).toBe('Caricamento giri')
    view.unmount()
  })
})
