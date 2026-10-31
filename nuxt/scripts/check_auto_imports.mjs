// Runs "nuxi prepare" (the same auto-import scan the dev server does) and fails on the warnings that
// otherwise only scroll by in the dev terminal: two exports with the same name in the auto-imported
// folders ("Duplicated imports") and re-exports the scan cannot follow ("failed to resolve").
// Usage: node scripts/check_auto_imports.mjs
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const nuxtRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The auto-import warnings in a "nuxi prepare" output, one line each. */
export function autoImportProblems(output) {
  // eslint-disable-next-line no-control-regex -- strip terminal colours
  const plain = output.replace(/\u001b\[[0-9;]*m/g, '')
  return plain.split(/\r?\n/)
    .filter(line => /Duplicated imports|failed to resolve/i.test(line))
    .map(line => line.replace(/^.*?WARN\s*/, '').trim())
}

function main() {
  // The package exports no subpaths: the file the "nuxi" bin points to.
  const nuxi = path.join(nuxtRoot, 'node_modules', '@nuxt', 'cli', 'bin', 'nuxi.mjs')
  const run = spawnSync(process.execPath, [nuxi, 'prepare'], { cwd: nuxtRoot, encoding: 'utf8', timeout: 180_000, env: { ...process.env, CI: '1' } })
  const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
  if (run.status !== 0) {
    console.error(`check_auto_imports: nuxi prepare failed (exit ${run.status ?? run.signal})\n${output.slice(-4000)}`)
    process.exit(1)
  }
  const problems = [...new Set(autoImportProblems(output))]
  if (problems.length) {
    console.error(`check_auto_imports: ${problems.length} auto-import problem(s)`)
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log('check_auto_imports: OK (no duplicated or unresolved auto-imports)')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
