// Compiles every SCSS of the site the way the dev server does: the files in app/assets/scss and every
// <style lang="scss"> block of the .vue components. Fails on a Sass error (e.g. ":deep(...)" with a
// suffix) and on any Sass deprecation warning (e.g. the global "map-get"), which no test sees because
// they only appear when a page is compiled. Usage: node scripts/check_styles.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'

const nuxtRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appDir = path.join(nuxtRoot, 'app')
const scssDir = path.join(appDir, 'assets', 'scss')

// Nuxt aliases used in @use: "~/..." and "@/..." both point to app/.
const aliasImporter = {
  findFileUrl(url) {
    const match = /^[~@]\/(.*)$/.exec(url)
    return match ? pathToFileURL(path.join(appDir, match[1])) : null
  },
}

function walk(dir, accept, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, accept, out)
    else if (accept(entry.name)) out.push(full)
  }
  return out
}

/** The <style lang="scss"> blocks of a component, with the line where each one starts. */
export function scssBlocks(source) {
  const blocks = []
  const re = /<style\b([^>]*)>([\s\S]*?)<\/style>/g
  let match
  while ((match = re.exec(source))) {
    if (!/\blang\s*=\s*["']scss["']/.test(match[1])) continue
    const before = source.slice(0, match.index + match[0].indexOf('>') + 1)
    blocks.push({ code: match[2], line: before.split('\n').length })
  }
  return blocks
}

export function compileOne(code, file, lineOffset = 0) {
  const problems = []
  const rel = path.relative(nuxtRoot, file).replaceAll('\\', '/')
  const where = span => `${rel}:${(span?.start?.line ?? 0) + 1 + lineOffset}`
  try {
    sass.compileString(code, {
      url: pathToFileURL(file),
      // No loadPaths: Nuxt/Vite has none either, so a bare @use resolves only next to the file (Codex).
      importers: [aliasImporter],
      logger: {
        warn(message, options) {
          // Deprecations only: an explicit @warn of our own code is a message, not a defect.
          if (!options.deprecation) return
          const id = options.deprecationType?.id ?? 'deprecation'
          // A warning raised inside an imported partial points at that partial, not at the component.
          const own = options.span?.url && fileURLToPath(options.span.url) !== file
          const at = own ? `${path.relative(nuxtRoot, fileURLToPath(options.span.url)).replaceAll('\\', '/')}:${options.span.start.line + 1}` : where(options.span)
          problems.push(`${at}  deprecation [${id}] ${message.split('\n')[0]}`)
        },
      },
    })
  } catch (error) {
    const own = error.span?.url && fileURLToPath(error.span.url) !== file
    const at = own ? `${path.relative(nuxtRoot, fileURLToPath(error.span.url)).replaceAll('\\', '/')}:${error.span.start.line + 1}` : where(error.span)
    problems.push(`${at}  error ${String(error.sassMessage ?? error.message).split('\n')[0]}`)
  }
  return problems
}

function main() {
  const problems = new Set()
  let compiled = 0
  for (const file of walk(scssDir, name => name.endsWith('.scss'))) {
    compileOne(fs.readFileSync(file, 'utf8'), file).forEach(p => problems.add(p)); compiled++
  }
  for (const file of walk(appDir, name => name.endsWith('.vue'))) {
    for (const block of scssBlocks(fs.readFileSync(file, 'utf8'))) {
      compileOne(block.code, file, block.line - 1).forEach(p => problems.add(p)); compiled++
    }
  }
  if (problems.size) {
    console.error(`check_styles: ${problems.size} problem(s) in ${compiled} stylesheets`)
    for (const p of [...problems].sort()) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log(`check_styles: OK (${compiled} stylesheets, no Sass errors or deprecations)`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
