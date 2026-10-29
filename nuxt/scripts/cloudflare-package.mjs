import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// PIP-672: the site sits at the root of dev.racercore.app; addresses under the old prefix are redirected.
export const APP_PATH = '/'
export const LEGACY_APP_PATH = '/acc-telemetry-dashboard/docs/'
// Detail pages (pages/<section>/[id].vue) have no generated file: the SPA shell serves them with 200, not via 404.html.
export const DYNAMIC_SECTIONS = ['sessioni', 'piste', 'piloti']
const extensions = new Set(['.html', '.css', '.js', '.json', '.ico', '.png', '.svg', '.ttf', '.woff', '.woff2', '.txt', '.wav', '.mp3', '.webp', '.jpg', '.jpeg', '.gif', '.avif', '.ogg', '.webm'])

// Validate everything before creating output; never overwrite or delete an existing directory.
export function packageCloudflare(source, destination) {
  const input = realpathSync(source)
  const output = resolve(destination)
  if (existsSync(output)) throw new Error('Destination already exists; choose a fresh task-owned directory')
  const files = []
  function walk(directory, prefix = '') {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      const rel = join(prefix, name)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) throw new Error(`Links are not publishable: ${rel}`)
      if (name.startsWith('.') || name.startsWith('_worker') || name === 'functions' || name === 'node_modules') throw new Error(`Unexpected publish input: ${rel}`)
      if (stat.isDirectory()) walk(path, rel)
      else if (!stat.isFile() || !extensions.has(extname(name).toLowerCase())) throw new Error(`Unexpected asset: ${rel}`)
      else {
        if (stat.size > 25 * 1024 * 1024) throw new Error(`Asset exceeds Pages size limit: ${rel}`)
        files.push(rel)
      }
    }
  }
  walk(input)
  for (const required of ['index.html', '404.html', '200.html']) {
    if (!files.includes(required)) throw new Error(`Missing generated ${required}; run npm run generate manually`)
  }
  if (files.length > 19997) throw new Error('Too many assets for Pages Free')
  // Resolve the parent to reject output aliases back inside docs.
  const parent = realpathSync(dirname(output))
  const relParent = relative(input, parent)
  if (relParent === '' || (!isAbsolute(relParent) && relParent !== '..' && !relParent.startsWith(`..${sep}`))) throw new Error('Output must be outside generated docs')
  for (const file of files) {
    const target = join(output, file)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(input, file), target)
  }
  // Old deep links go through 404.html, which keeps query and fragment and never leaves the site. A
  // `/:splat` rule here would turn "/acc-telemetry-dashboard/docs//other.example" into another host.
  writeFileSync(join(output, '_redirects'), [
    `${LEGACY_APP_PATH} / 301`,
    `${LEGACY_APP_PATH.slice(0, -1)} / 301`,
    ...DYNAMIC_SECTIONS.map(section => `${APP_PATH}${section}/:id ${APP_PATH}200 200`),
    '',
  ].join('\n'))
  // Only fingerprinted assets get immutable caching; HTML and mutable manifests must revalidate.
  writeFileSync(join(output, '_headers'), [
    ...['js', 'css', 'woff2'].flatMap(extension => [
      `${APP_PATH}assets/*.${extension}`,
      '  Cache-Control: public, max-age=31536000, immutable',
    ]),
    `${APP_PATH}images/optimized/*`,
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n'))
  return { files: files.length, appPath: APP_PATH, output }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, destination] = process.argv.slice(2)
  if (!source || !destination) throw new Error('Usage: node cloudflare-package.mjs <generated-docs> <new-output-directory>')
  console.log(JSON.stringify(packageCloudflare(source, destination)))
}
