import { RACING_BACKDROP_BACKGROUND, RACING_SPARK_FROM, RACING_SPARK_TO, RACING_SPARKS } from './racingBackdrop'

// PIP-640: what a browser shows while the app's JavaScript downloads (Nuxt spaLoadingTemplate). The site is
// built in the browser: without this the first paint waits for the whole bundle (seconds on a phone), and
// PageSpeed measures that. Never in the desktop app (Electron): its in-game overlays are transparent windows
// that must not flash a logo.
// The one loader of the site, from the first byte until the content is ready: the app background (red glow and
// falling sparks, same look and same clock as the Vue backdrop), the logo glowing softly and a red laser running
// under it. When the app mounts, its own backdrop takes over underneath (app/utils/bootScreen.ts hides this copy);
// when the first screen is ready the logo fades out while the interface fades in. The script moves the screen
// and its style out of Nuxt's loader element, which Nuxt removes at once on mount (that removal was the jump);
// it spans the whole window (100vw), so the scrollbar space reserved later by the page CSS does not move it.
// The logo-and-laser loader itself (BOOT_LOADER_CSS, bootLoaderHtml) is also the app's own loading screen, in
// place of a spinner, so there is one loader everywhere.
export const BOOT_SCREEN_ID = 'rc-boot'
export const BOOT_LEAVE_MS = 800

export const BOOT_LOADER_CSS = [
  `.rc-boot__inner{display:grid;justify-items:center;gap:30px;animation:rc-boot-in .55s cubic-bezier(.2,.7,.2,1) both;transition:opacity ${BOOT_LEAVE_MS}ms cubic-bezier(.4,0,.2,1),transform ${BOOT_LEAVE_MS}ms cubic-bezier(.4,0,.2,1)}`,
  '.rc-boot__inner img{width:min(410px,80vw);height:auto;filter:drop-shadow(0 0 12px #ff002438);animation:rc-boot-glow 2.4s ease-in-out infinite}',
  // Laser: a dim track and a beam of light running along it (white-hot core, red glow). The glow has room
  // above and below (no clipping) and the ends fade out through a mask instead of being cut.
  '.rc-boot__laser{position:relative;width:min(300px,64vw);height:60px;margin:-24px 0;-webkit-mask-image:linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent);mask-image:linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent)}',
  ".rc-boot__laser::before{content:'';position:absolute;left:0;right:0;top:29px;height:2px;background:#ff1f3d40;box-shadow:0 0 6px #ff1f3d40}",
  ".rc-boot__laser::after{content:'';position:absolute;left:0;top:29px;width:38%;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,#ff2d4b99 25%,#ff3a55 62%,#ffc2cb 88%,#fff 96%,transparent);box-shadow:0 0 3px 1px #ff5a70,0 0 10px 2px #ff1f3dcc,0 0 22px 5px #ff002466;animation:rc-boot-laser 1.7s cubic-bezier(.45,0,.25,1) infinite}",
  // Starts just above zero, not at zero: a frame at opacity 0 does not count as a first paint for PageSpeed.
  '@keyframes rc-boot-in{from{opacity:.01;transform:scale(.97)}}',
  '@keyframes rc-boot-glow{50%{filter:drop-shadow(0 0 28px #ff002480)}}',
  '@keyframes rc-boot-laser{from{transform:translateX(-100%)}to{transform:translateX(264%)}}',
  '@media (prefers-reduced-motion:reduce){.rc-boot__inner,.rc-boot__inner img,.rc-boot__laser::after{animation:none!important;transition:none!important}}',
].join('')

const id = `#${BOOT_SCREEN_ID}`
const BOOT_SCREEN_CSS = [
  // Sized to the whole window by the start script (innerWidth): the space the page CSS later reserves for the
  // scrollbar changes 100vw and the visible width, and the logo moved sideways with it.
  `${id}{position:fixed;left:0;top:0;z-index:2147483000;display:none;place-items:center;width:var(--rc-boot-w,100vw);height:100vh;height:100dvh;pointer-events:none}`,
  `${id} .rc-boot__bg{position:absolute;inset:0;z-index:-1;overflow:hidden;background:${RACING_BACKDROP_BACKGROUND}}`,
  `${id}.has-app .rc-boot__bg{display:none}`,
  `${id} .rc-boot__bg i{position:absolute;width:3px;height:3px;border-radius:50%;background:#ff7188;box-shadow:0 0 5px #f4002870;animation:rc-spark 18s linear infinite}`,
  `${id}.is-leaving .rc-boot__inner{opacity:0;transform:scale(1.04)}`,
  `@keyframes rc-spark{0%{transform:${RACING_SPARK_FROM};opacity:0}20%,70%{opacity:.7}100%{transform:${RACING_SPARK_TO};opacity:0}}`,
  `@media (prefers-reduced-motion:reduce){${id} .rc-boot__bg i{animation:none;opacity:.5}}`,
].join('')

const sparksHtml = RACING_SPARKS
  .map(spark => `<i data-d="${spark.delayS}" style="left:${spark.left};top:${spark.top};animation-duration:${spark.durationS}s"></i>`)
  .join('')

// Browser only: show the screen, lift it and its style out of the loader, and put the sparks on the page clock.
const bootScript = `(function(){var b=document.getElementById('${BOOT_SCREEN_ID}');if(/Electron/.test(navigator.userAgent)){b.remove();return}`
  + `var t=performance.now()/1000;b.querySelectorAll('i[data-d]').forEach(function(i){i.style.animationDelay=(i.getAttribute('data-d')-t)+'s'});`
  + `var w=function(){b.style.setProperty('--rc-boot-w',innerWidth+'px')};w();addEventListener('resize',w);b.style.display='grid';document.head.appendChild(document.getElementById('${BOOT_SCREEN_ID}-style'));document.body.appendChild(b)})()`

const withSlash = (baseURL: string) => baseURL.endsWith('/') ? baseURL : `${baseURL}/`

export const bootLogoSrc = (baseURL: string) => `${withSlash(baseURL)}branding/auth/racer_core_exact.svg`

// Logo and laser, for any container with the class rc-boot__inner (app.vue writes the same two elements).
export function bootLoaderHtml(baseURL: string): string {
  return `<img src="${bootLogoSrc(baseURL)}" alt="Racer Core" width="410" height="205" fetchpriority="high" decoding="async">`
    + '<div class="rc-boot__laser"></div>'
}

export function spaLoadingHtml(baseURL: string): string {
  return [
    `<style id="${BOOT_SCREEN_ID}-style">${BOOT_LOADER_CSS}${BOOT_SCREEN_CSS}</style>`,
    `<div id="${BOOT_SCREEN_ID}" role="status" aria-label="Caricamento">`,
    `<div class="rc-boot__bg" aria-hidden="true">${sparksHtml}</div>`,
    `<div class="rc-boot__inner">${bootLoaderHtml(baseURL)}</div>`,
    '</div>',
    `<script>${bootScript}</script>`,
  ].join('')
}
