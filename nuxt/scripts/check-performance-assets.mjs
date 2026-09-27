import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(readFileSync(join(root, 'app/assets/image-manifest.json'), 'utf8'))
let original = 0, thumbnails = 0, large = 0
for (const [source, image] of Object.entries(manifest)) {
  original += image.sourceBytes
  assert(image.variants.length >= 2, `${source}: responsive candidates missing`)
  for (const variant of image.variants) {
    const path = join(root, 'public', variant.src)
    assert.equal(statSync(path).size, variant.bytes, `${source}: stale generated asset`)
    const bytes = readFileSync(path)
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
  }
  thumbnails += image.variants[0].bytes
  large += image.variants.at(-1).bytes
}
assert(thumbnails < 800_000, 'Thumbnail budget exceeded: review quality/size before raising budget')
assert(large < 6_000_000, 'Large image budget exceeded')
assert(!readFileSync(join(root, 'app/utils/overviewCarImage.ts'), 'utf8').includes("from '@/assets/images/cars/"), 'Eager car image imports reintroduced')
// --build is explicit: ordinary source CI must not inspect stale output from another build.
if (process.argv.includes('--build')) {
  const output = join(root, '.output/public')
  assert(existsSync(join(output, 'index.html')), 'Build first')
  const html = readFileSync(join(output, 'index.html'), 'utf8')
  assert(!/<link[^>]*rel="prefetch"[^>]*as="image"/.test(html), 'Global image prefetch reintroduced')
  for (const image of Object.values(manifest)) for (const variant of image.variants) {
    assert(existsSync(join(output, variant.src)), `Missing deployed asset ${variant.src}`)
  }
  const js = readdirSync(join(output, 'assets')).filter(n => n.endsWith('.js'))
  const largest = Math.max(...js.map(n => statSync(join(output, 'assets', n)).size))
  assert(largest < 1_100_000, 'Largest JS chunk exceeds measured baseline budget')
  console.log(`Production: ${js.length} JS chunks, largest ${largest} bytes; no global image prefetch`)
}
console.log(`PERFORMANCE ASSETS PASS: ${Object.keys(manifest).length} images, original=${original}, thumbnails=${thumbnails}, large=${large}`)
