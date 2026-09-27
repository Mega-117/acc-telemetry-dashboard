// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { responsiveImage } from '~/utils/responsiveImage'
import ResponsiveImage from '~/components/ui/ResponsiveImage.vue'
import { decodeOverviewImage } from '~/services/auth/overviewEntryPreparation'

afterEach(() => vi.unstubAllGlobals())
describe('responsive static assets', () => {
  it.each(['/', '/acc-telemetry-dashboard/docs/', '/custom'])('resolves known assets once under %s', base => {
    const prefix = `${base.replace(/\/$/, '')}/`
    const result = responsiveImage('/images/cars/ferrari_296_gt3.png', base, '460px')
    expect(result.src).toMatch(/ferrari_296_gt3-512-[a-f0-9]+\.webp$/)
    expect(result.src.startsWith(prefix)).toBe(true)
    expect(result.srcset?.split(', ')).toHaveLength(3)
    expect(result).toMatchObject({ sizes: '460px', width: 1024, height: 1024, decoding: 'async' })
    expect(responsiveImage(`${prefix}images/cars/ferrari_296_gt3.png`, base)).toMatchObject({ src: result.src })
  })
  it.each(['https://example.org/photo.png', '//example.org/photo.png', 'data:image/svg+xml,test', 'blob:example', 'acc-voice:example'])('preserves external source %s', src => {
    expect(responsiveImage(src, '/nested/')).toEqual({ src, decoding: 'async' })
  })
  it('preserves unknown/custom paths and vector originals without a false srcset', () => {
    expect(responsiveImage('/custom.svg', '/nested/')).toEqual({ src: '/nested/custom.svg', decoding: 'async' })
    expect(responsiveImage('/tracks/track_default.png')).toEqual({ src: '/tracks/track_default.png', decoding: 'async' })
  })
  it('changes the rendered asset and keeps priority/loading controlled by the caller', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL: '/nested/' } }))
    const wrapper = mount(ResponsiveImage, { props: { src: '/tracks/track_monza.png', alt: 'Monza', sizes: '210px' } })
    expect(wrapper.attributes('loading')).toBe('lazy')
    expect(wrapper.attributes('width')).toBeTruthy()
    expect(wrapper.attributes('srcset')).toContain('256w')
    await wrapper.setProps({ src: '/images/cars/ferrari_296_gt3.png', alt: 'Ferrari', loading: 'eager' })
    expect(wrapper.attributes('src')).toContain('ferrari_296')
    expect(wrapper.attributes('alt')).toBe('Ferrari')
    expect(wrapper.attributes('loading')).toBe('eager')
    wrapper.unmount()
  })
  it('prepares the same responsive candidate before assigning src, avoiding a second hero download', async () => {
    const assignments: string[] = []
    const decode = vi.fn(async () => {})
    vi.stubGlobal('Image', class {
      set sizes(v: string) { assignments.push(`sizes:${v}`) }
      set srcset(v: string) { assignments.push(`srcset:${v}`) }
      set src(v: string) { assignments.push(`src:${v}`) }
      decode = decode
    })
    await decodeOverviewImage({ src: '/hero.webp', sizes: '460px', srcset: '/hero.webp 512w' })
    expect(assignments).toEqual(['sizes:460px', 'srcset:/hero.webp 512w', 'src:/hero.webp'])
    expect(decode).toHaveBeenCalledOnce()
  })
})
