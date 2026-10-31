import path from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs check scripts, no type declarations
import { compileOne, scssBlocks } from '../../scripts/check_styles.mjs'
// @ts-expect-error plain .mjs check scripts, no type declarations
import { autoImportProblems } from '../../scripts/check_auto_imports.mjs'

const file = path.resolve(__dirname, '../../app/components/Fake.vue')

describe('check_styles: what only the dev server used to show', () => {
  it('fails on a :deep() selector with a suffix (LapChoiceDialog, 31/10)', () => {
    const problems = compileOne('.dialog :deep(.btn) { color: red; &--ghost { color: blue; } }', file, 29)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/Fake\.vue:30 {2}error .*can't have a suffix/)
  })

  it('fails on deprecated global functions (map-get, lighten)', () => {
    const problems = compileOne('$m: (a: red); .x { color: map-get($m, a); background: lighten(#333, 10%); }', file)
    expect(problems.join('\n')).toMatch(/deprecation \[global-builtin\]/)
    expect(problems.join('\n')).toMatch(/deprecation \[color-functions\]/)
  })

  it('passes the module forms and resolves the ~/ and @/ aliases', () => {
    const code = "@use 'sass:map'; @use 'sass:color'; @use '~/assets/scss/variables' as *; @use '@/assets/scss/variables' as v;\n$m: (a: red); .x { color: map.get($m, a); background: color.adjust(#333, $lightness: 10%); }"
    expect(compileOne(code, file)).toEqual([])
  })

  it('finds only the scss style blocks of a component, with their first line', () => {
    const blocks = scssBlocks('<template>\n<div/>\n</template>\n<style>\n.a{}\n</style>\n<style scoped lang="scss">\n.b { .c {} }\n</style>')
    expect(blocks).toEqual([{ code: '\n.b { .c {} }\n', line: 7 }])
  })
})

describe('check_auto_imports', () => {
  it('reports duplicated and unresolved auto-imports from the prepare output', () => {
    const output = [
      '\u001b[33m[11:20:27]  WARN  [unimport] failed to resolve "app/utils/~/utils/x", skip scanning\u001b[39m',
      '[11:20:27]  WARN  Duplicated imports "localDay", the one from "a.ts" has been ignored and "b.ts" is used',
      'ℹ Types generated in .nuxt',
    ].join('\n')
    expect(autoImportProblems(output)).toEqual([
      '[unimport] failed to resolve "app/utils/~/utils/x", skip scanning',
      'Duplicated imports "localDay", the one from "a.ts" has been ignored and "b.ts" is used',
    ])
    expect(autoImportProblems('ℹ Types generated in .nuxt')).toEqual([])
  })
})
