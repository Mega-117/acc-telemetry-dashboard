import { readFileSync, readdirSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// PIP-673: every file imports the app composables it calls. Auto-imports of the app's own
// folders are fragile (the desktop build ran through "Nuova cartella (9)", the scanner read "(9)" as a
// glob and found nothing: "useAppNotifications is not defined" in 0.5.3-dev.2 only), so the source
// never relies on them.
const appRoot = resolve(process.cwd(), 'app')

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return ['.ts', '.vue'].includes(extname(entry.name)) ? [path] : []
  })
}

const sharedNames = [...new Set(listSourceFiles(resolve(appRoot, 'composables')).flatMap(path =>
  [...readFileSync(path, 'utf8').matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(use[A-Z]\w*)/g)].map(match => match[1]!)))]

function withoutComments(text: string) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/<!--[\s\S]*?-->/g, '')
}

// Local names bound by value imports (type-only imports bind nothing at runtime).
function importedNames(source: string): Set<string> {
  const names = new Set<string>()
  for (const [, clause] of source.matchAll(/^\s*import\s+(?!type\s)([^'";]+?)\s+from\s+['"][^'"]+['"]/gm)) {
    const [defaultPart, braces] = [clause!.replace(/\{[\s\S]*\}/, '').replace(/,\s*$/, '').trim(), /\{([\s\S]*)\}/.exec(clause!)?.[1]]
    if (defaultPart && !defaultPart.startsWith('*')) names.add(defaultPart)
    for (const specifier of braces?.split(',') ?? []) {
      const parts = specifier.trim().split(/\s+as\s+/)
      if (!parts[0] || parts[0].startsWith('type ')) continue
      names.add((parts[1] ?? parts[0]).trim())
    }
  }
  return names
}

function missingImports(text: string): string[] {
  const source = withoutComments(text)
  const imported = importedNames(source)
  return sharedNames.filter(name =>
    !imported.has(name)
    && new RegExp(`(?<![\\w.$])${name.replace('$', '\\$')}\\s*\\(`).test(source)
    && !new RegExp(`(?:function\\*?|const|let|var)\\s+${name.replace('$', '\\$')}\\b`).test(source))
}

describe('explicit imports of app composables (PIP-673)', () => {
  it('finds the shared names to check', () => {
    expect(sharedNames).toContain('useAppNotifications')
    expect(sharedNames).toContain('useTelemetryData')
    expect(sharedNames.every(name => name.startsWith('use'))).toBe(true)
  })

  it('flags a call without a value import of that name', () => {
    expect(missingImports('const { push } = useAppNotifications()')).toEqual(['useAppNotifications'])
    expect(missingImports("import { ref } from 'vue'\nuseAppNotifications()")).toEqual(['useAppNotifications'])
    expect(missingImports("import type { useAppNotifications } from '~/composables/useAppNotifications'\nuseAppNotifications()")).toEqual(['useAppNotifications'])
    expect(missingImports("import { type useAppNotifications } from '~/composables/useAppNotifications'\nuseAppNotifications()")).toEqual(['useAppNotifications'])
    expect(missingImports("import { useAppNotifications as notify } from '~/composables/useAppNotifications'\nuseAppNotifications()")).toEqual(['useAppNotifications'])
  })

  it('accepts imports, property calls, local declarations and comments', () => {
    expect(missingImports("import {\n  useAppNotifications,\n} from '~/composables/useAppNotifications'\nuseAppNotifications()")).toEqual([])
    expect(missingImports("import { useAppNotifications as notify } from '~/composables/useAppNotifications'\nnotify()")).toEqual([])
    expect(missingImports('auth.useAppNotifications()')).toEqual([])
    expect(missingImports('function useAppNotifications() { return 1 }\nuseAppNotifications()')).toEqual([])
    expect(missingImports('/** shared with useAppNotifications (push) */\n// useAppNotifications()')).toEqual([])
  })

  it('every app file imports the composables it calls', () => {
    const offenders = listSourceFiles(appRoot).flatMap(path =>
      missingImports(readFileSync(path, 'utf8')).map(name => `${relative(appRoot, path)}: ${name}`))
    expect(offenders).toEqual([])
  })
})
