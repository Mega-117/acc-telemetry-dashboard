import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packageCloudflare, APP_PATH } from '../../scripts/cloudflare-package.mjs'

const roots: string[] = []
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pip402-package-'))
  roots.push(root)
  const docs = join(root, 'docs')
  const output = join(root, 'publish')
  mkdirSync(join(docs, 'assets'), { recursive: true })
  writeFileSync(join(docs, 'index.html'), '<html>generated</html>')
  writeFileSync(join(docs, '404.html'), '<html>fallback</html>')
  writeFileSync(join(docs, 'assets', 'app.js'), 'window.example = 1')
  writeFileSync(join(root, '.env'), 'PRIVATE=not-published')
  return { root, docs, output }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('Cloudflare static package', () => {
  it('keeps generated asset bytes and the Pages base path, without publishing repository files', () => {
    const { docs, output } = fixture()
    expect(packageCloudflare(docs, output)).toMatchObject({ files: 3, appPath: APP_PATH })
    for (const file of ['index.html', '404.html', 'assets/app.js']) {
      expect(readFileSync(join(output, APP_PATH, file))).toEqual(readFileSync(join(docs, file)))
    }
    expect(readFileSync(join(output, '404.html'), 'utf8')).toBe('<html>fallback</html>')
    expect(readFileSync(join(output, '_redirects'), 'utf8')).toBe(`/ ${APP_PATH} 302\n`)
    expect(existsSync(join(output, '.env'))).toBe(false)
  })
  it('refuses to overwrite previous output', () => {
    const { docs, output } = fixture()
    mkdirSync(output)
    writeFileSync(join(output, 'keep'), 'old')
    expect(() => packageCloudflare(docs, output)).toThrow('already exists')
    expect(readFileSync(join(output, 'keep'), 'utf8')).toBe('old')
  })
  it.each(['index.html', '404.html'])('requires generated %s', (file) => {
    const { docs, output } = fixture()
    rmSync(join(docs, file))
    expect(() => packageCloudflare(docs, output)).toThrow('Missing generated')
    expect(existsSync(output)).toBe(false)
  })
  it.each(['.env', 'source.ts', '_worker.js', 'bundle.js.map'])('rejects unexpected input %s before writing', (file) => {
    const { docs, output } = fixture()
    writeFileSync(join(docs, file), 'not public')
    expect(() => packageCloudflare(docs, output)).toThrow(/Unexpected/)
    expect(existsSync(output)).toBe(false)
  })
  it('rejects an output directory inside the input', () => {
    const { docs } = fixture()
    expect(() => packageCloudflare(docs, join(docs, 'publish'))).toThrow('outside generated docs')
  })
})
