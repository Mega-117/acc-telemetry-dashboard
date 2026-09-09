import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP_PATH = '/acc-telemetry-dashboard/docs/'
const extensions = new Set(['.html', '.css', '.js', '.json', '.ico', '.png', '.svg', '.ttf', '.woff', '.woff2', '.txt', '.wav', '.mp3', '.webp', '.jpg', '.jpeg', '.gif', '.avif', '.ogg'])

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
  for (const required of ['index.html', '404.html']) {
    if (!files.includes(required)) throw new Error(`Missing generated ${required}; run npm run generate manually`)
  }
  if (files.length > 19998) throw new Error('Too many assets for Pages Free')
  // Resolve the parent to reject output aliases back inside docs.
  const parent = realpathSync(dirname(output))
  const relParent = relative(input, parent)
  if (relParent === '' || (!isAbsolute(relParent) && relParent !== '..' && !relParent.startsWith(`..${sep}`))) throw new Error('Output must be outside generated docs')
  const app = join(output, APP_PATH.slice(1))
  for (const file of files) {
    const target = join(app, file)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(input, file), target)
  }
  copyFileSync(join(input, '404.html'), join(output, '404.html'))
  writeFileSync(join(output, '_redirects'), `/ ${APP_PATH} 302\n`)
  return { files: files.length, appPath: APP_PATH, output }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, destination] = process.argv.slice(2)
  if (!source || !destination) throw new Error('Usage: node cloudflare-package.mjs <generated-docs> <new-output-directory>')
  console.log(JSON.stringify(packageCloudflare(source, destination)))
}
