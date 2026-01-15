/**
 * Composable per ottenere il path corretto per file nella cartella public
 * Risolve il problema dei path assoluti con GitHub Pages
 */
export function usePublicPath() {
    const config = useRuntimeConfig()

    /**
     * Restituisce il path completo per un file nella cartella public
     * @param path - Path relativo alla cartella public (es. '/tracks/track_monza.png')
     * @returns Path completo con baseURL
     */
    function getPublicPath(path: string): string {
        // Rimuovi lo slash iniziale se presente per evitare doppi slash
        const cleanPath = path.startsWith('/') ? path.slice(1) : path
        const base = config.app.baseURL || '/'
        // Assicurati che ci sia uno slash finale nel base
        const normalizedBase = base.endsWith('/') ? base : base + '/'
        return normalizedBase + cleanPath
    }

    return {
        getPublicPath
    }
}
