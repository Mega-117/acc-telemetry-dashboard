// PIP-638: il sito non si fa indicizzare da Google finche' non c'e' un lancio ufficiale.
// Un solo interruttore per cambiarlo: la variabile di build RACER_SITE_INDEXABLE=1 (vedi la wiki,
// "Indicizzazione del sito"). Senza, ogni pagina porta <meta name="robots" content="noindex, nofollow">.
// robots.txt non basta: su GitHub Pages il sito sta in una sottocartella, e Google lo legge solo alla radice.
export const SITE_INDEXABLE_ENV = 'RACER_SITE_INDEXABLE'

export function siteIndexable(env: Record<string, string | undefined>): boolean {
  return env[SITE_INDEXABLE_ENV] === '1'
}

/** Il meta da mettere nella testata di ogni pagina; null quando il sito e' indicizzabile. */
export function siteRobotsMeta(env: Record<string, string | undefined>): { name: 'robots', content: string } | null {
  return siteIndexable(env) ? null : { name: 'robots', content: 'noindex, nofollow' }
}
