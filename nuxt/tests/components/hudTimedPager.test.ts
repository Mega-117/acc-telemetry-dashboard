import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import HudTimedPager from '~/components/overlay/HudTimedPager.vue'

describe('HudTimedPager', () => {
  it('rende un selettore riusabile e soltanto lo slot della pagina attiva', async () => {
    const app = createSSRApp({
      render: () => h(HudTimedPager, {
        pages: [
          { id: 'live', label: 'LIVE' },
          { id: 'setup', label: 'SETUP', temporary: true },
        ],
        defaultPage: 'live',
      }, {
        live: () => h('div', 'PAGINA LIVE'),
        setup: () => h('div', 'PAGINA SETUP'),
      }),
    })

    const html = await renderToString(app)
    expect(html).toContain('aria-label="Pagina HUD"')
    expect(html).toContain('hud-timed-pager__footer')
    expect(html).toContain('LIVE')
    expect(html).toContain('SETUP')
    expect(html).toContain('PAGINA LIVE')
    expect(html).not.toContain('PAGINA SETUP')
    expect(html).not.toContain('hud-timed-pager__progress')
  })

  it('rende SETUP e la progress line quando è la pagina iniziale temporanea', async () => {
    const app = createSSRApp({
      render: () => h(HudTimedPager, {
        pages: [
          { id: 'live', label: 'LIVE' },
          { id: 'setup', label: 'SETUP', temporary: true },
        ],
        defaultPage: 'live',
        initialPage: 'setup',
      }, {
        live: () => h('div', 'PAGINA LIVE'),
        setup: () => h('div', 'PAGINA SETUP'),
      }),
    })

    const html = await renderToString(app)
    expect(html).toContain('PAGINA SETUP')
    expect(html).toContain('hud-timed-pager__progress')
  })
  it('supporta una pagina TARGET persistente con switcher flottante e hit region', async () => {
    const app = createSSRApp({
      render: () => h(HudTimedPager, {
        pages: [
          { id: 'live', label: 'LIVE' },
          { id: 'target', label: 'TARGET', temporary: false },
        ],
        defaultPage: 'live',
        initialPage: 'target',
        floatingSwitcher: true,
      }, {
        live: () => h('div', 'PAGINA LIVE'),
        target: () => h('div', 'PAGINA TARGET'),
      }),
    })

    const html = await renderToString(app)
    expect(html).toContain('PAGINA TARGET')
    expect(html).toContain('hud-timed-pager--floating-switcher')
    expect(html).toContain('data-overlay-interactive')
    expect(html).not.toContain('hud-timed-pager__progress')
  })

})
