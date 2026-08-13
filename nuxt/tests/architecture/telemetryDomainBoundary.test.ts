import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appRoot = resolve(process.cwd(), 'app')
const sourceExtensions = new Set(['.ts', '.vue'])

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return sourceExtensions.has(extname(entry.name)) ? [path] : []
  })
}

function scriptSource(path: string): string {
  const source = readFileSync(path, 'utf8')
  if (!path.endsWith('.vue')) return source

  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .join('\n')
}

function importSpecifiers(source: string): string[] {
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ]

  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]))
}

function resolveInternalImport(sourcePath: string, specifier: string, files: Set<string>): string | null {
  let basePath: string
  if (specifier.startsWith('~/') || specifier.startsWith('@/')) {
    basePath = resolve(appRoot, specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    basePath = resolve(dirname(sourcePath), specifier)
  } else {
    return null
  }

  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.vue`,
    resolve(basePath, 'index.ts'),
    resolve(basePath, 'index.vue'),
  ]
  return candidates.find((candidate) => files.has(candidate)) || null
}

function buildImportGraph(): Map<string, string[]> {
  const sourceFiles = listSourceFiles(appRoot)
  const fileSet = new Set(sourceFiles)

  return new Map(sourceFiles.map((sourcePath) => {
    const dependencies = importSpecifiers(scriptSource(sourcePath))
      .map((specifier) => resolveInternalImport(sourcePath, specifier, fileSet))
      .filter((dependency): dependency is string => dependency !== null)
    return [sourcePath, [...new Set(dependencies)]]
  }))
}

function findCycles(graph: Map<string, string[]>): string[][] {
  const state = new Map<string, 'visiting' | 'visited'>()
  const stack: string[] = []
  const cycles: string[][] = []

  function visit(node: string): void {
    state.set(node, 'visiting')
    stack.push(node)

    for (const dependency of graph.get(node) || []) {
      if (!state.has(dependency)) {
        visit(dependency)
      } else if (state.get(dependency) === 'visiting') {
        const cycleStart = stack.lastIndexOf(dependency)
        cycles.push([...stack.slice(cycleStart), dependency])
      }
    }

    stack.pop()
    state.set(node, 'visited')
  }

  for (const node of graph.keys()) {
    if (!state.has(node)) visit(node)
  }
  return cycles
}

function displayPath(path: string): string {
  return relative(appRoot, path).replaceAll('\\', '/')
}

describe('telemetry domain architecture', () => {
  it('keeps lower layers independent from the telemetry facade composable', () => {
    const graph = buildImportGraph()
    const facadePath = resolve(appRoot, 'composables/useTelemetryData.ts')
    const lowerLayerRoots = ['repositories', 'services', 'types', 'utils']
    const violations = lowerLayerRoots.flatMap((directory) => {
      const root = resolve(appRoot, directory)
      return listSourceFiles(root)
        .filter((path) => graph.get(path)?.includes(facadePath))
        .map(displayPath)
    })

    expect(violations).toEqual([])
  })

  it('does not turn the telemetry facade into a compatibility export barrel', () => {
    const source = readFileSync(resolve(appRoot, 'composables/useTelemetryData.ts'), 'utf8')
    expect(source).not.toMatch(/\bexport\s+(?:type\s+)?\{/)
  })

  it('keeps the frontend application import graph acyclic', () => {
    const cycles = findCycles(buildImportGraph())
      .map((cycle) => cycle.map(displayPath))

    expect(cycles).toEqual([])
  })
})
