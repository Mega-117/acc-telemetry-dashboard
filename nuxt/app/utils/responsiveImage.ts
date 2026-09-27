import manifest from '~/assets/image-manifest.json'

type ImageEntry = { width: number; height: number; variants: { width: number; src: string }[] }
const images: Record<string, ImageEntry> = manifest

/** Preserve remote/custom images; only optimize known assets, independently of deployment base. */
export function responsiveImage(source: string, baseURL = '/', sizes = '100vw') {
  const base = `${baseURL.replace(/\/$/, '')}/`
  const external = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(source)
  const key = source.startsWith(base) ? `/${source.slice(base.length)}` : `/${source.replace(/^\//, '')}`
  const publicURL = (path: string) => base + path.replace(/^\//, '')
  const entry = external ? undefined : images[key]
  if (!entry) return { src: external ? source : publicURL(key), decoding: 'async' as const }
  const fallback = entry.variants.find(v => v.width >= 512) || entry.variants[entry.variants.length - 1]!
  return {
    src: publicURL(fallback.src),
    srcset: entry.variants.map(v => `${publicURL(v.src)} ${v.width}w`).join(', '),
    sizes, width: entry.width, height: entry.height, decoding: 'async' as const,
  }
}

export const OVERVIEW_CAR_SIZES = '(max-width: 800px) calc(100vw - 48px), (max-width: 1400px) calc(58.7vw - 38px), 784px'
export const TRACK_CARD_SIZES = '(max-width: 520px) calc((100vw - 60px) / 2), (max-width: 760px) calc((100vw - 76px) / 3), (max-width: 1100px) calc((100vw - 102px) / 4), 210px'
