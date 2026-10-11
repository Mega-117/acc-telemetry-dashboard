// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileScript, parse } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import { expect, it } from 'vitest'

it('does not load synthetic preview data in the production renderer', async () => {
  const source = readFileSync(resolve('app/pages/training-overlay.vue'), 'utf8')
  const { descriptor } = parse(source)
  const script = compileScript(descriptor, { id: 'quick-panel-production' })
  const production = await transform(script.content, {
    loader: 'ts', format: 'esm', minifySyntax: true, define: { 'import.meta.dev': 'false' },
  })
  expect(production.code).not.toContain("import(\"~/services/overlay/quickPanelPreview\")")
  const development = await transform(script.content, {
    loader: 'ts', format: 'esm', minifySyntax: true, define: { 'import.meta.dev': 'true' },
  })
  expect(development.code).toContain('~/services/overlay/quickPanelPreview')
})
