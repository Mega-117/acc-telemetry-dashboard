// PIP-555: cosa mostra la Panoramica prima che la sessione cloud sia pronta.
// L'app entra con il profilo locale un paio di secondi prima del cloud: in quel
// buco si usa l'archivio gia' noto (lista sessioni in cache, idratata dal disco
// alla stessa revisione dell'owner, piu' le sessioni locali non sincronizzate).
// Senza niente da mostrare la pagina resta in attesa invece di dire "nessuna
// sessione": una risposta definitiva sbagliata e' peggio di un secondo di attesa.
import type { SessionDocument } from '~/types/telemetry'
import { mergePendingLocal } from '~/services/telemetry/telemetryMergeService'

export class OverviewNotReadyError extends Error {
  constructor() {
    super('Panoramica non pronta: sessione cloud in arrivo')
    this.name = 'OverviewNotReadyError'
  }
}

/** Archivio da mostrare offline: cache + locali in attesa; senza cache solo le locali. */
export function selectOfflineOverviewSessions(cached: SessionDocument[] | null, local: SessionDocument[]): SessionDocument[] {
  return cached ? mergePendingLocal(cached, local, true) : local
}

/** Niente da mostrare e cloud ancora possibile: aspettare, non concludere "vuoto". */
export function shouldWaitForCloud(input: { sessions: number; cloudReady: boolean; browserOnline: boolean }): boolean {
  return input.sessions === 0 && !input.cloudReady && input.browserOnline
}
