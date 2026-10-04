import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { compileString } from 'sass'
import { expect, it } from 'vitest'

it('compiles the real track detail Sass including shared controls', () => {
  const file = resolve('app/components/pages/TrackDetailPage.vue')
  const { descriptor } = parse(readFileSync(file, 'utf8'))
  for (const style of descriptor.styles) {
    const result = compileString(style.content, {
      url: pathToFileURL(file),
      importers: [{ findFileUrl: url => url.startsWith('@/') ? pathToFileURL(resolve('app', url.slice(2))) : null }],
    })
    expect(result.css.length).toBeGreaterThan(0)
  }
})
