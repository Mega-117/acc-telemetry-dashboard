// PIP-640: what a browser shows while the app's JavaScript downloads (Nuxt spaLoadingTemplate). The site is
// built in the browser: without this the first paint waits for the whole bundle (seconds on a phone), and
// PageSpeed measures that. The logo is the same file as the login one, at the same size, so it is painted at
// once and the login takes its place. Never in the desktop app (Electron): its in-game overlays are
// transparent windows that must not flash a logo.
export function spaLoadingHtml(baseURL: string): string {
  const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`
  return [
    '<div id="rc-boot" style="position:fixed;inset:0;display:none;place-items:center;background:#050506">',
    `<img src="${base}branding/auth/racer_core_exact.svg" alt="Racer Core" width="410" height="205" fetchpriority="high" decoding="async" style="width:min(410px,80vw);height:auto">`,
    '</div>',
    "<script>if(!/Electron/.test(navigator.userAgent))document.getElementById('rc-boot').style.display='grid'</script>",
  ].join('')
}
