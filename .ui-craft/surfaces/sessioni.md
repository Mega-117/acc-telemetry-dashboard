# Sessioni Racer Core — PIP-422

## Contratto visivo
Mockup utente del 25 settembre 2026: unica lista tabellare trasparente,
raggruppata per giorno con tipi misti. Nessuna vista card, nessuno switch vista,
sessioni a zero giri sempre nascoste. Header e sfondo restano quelli condivisi.

## Composizione e riuso
Tipo sessione su tab visibili; pista, categoria, auto e periodo su select.
Colonne: tipo, ora, pista, auto, giri, stint, Q, R. Il pulsante pista apre il
dettaglio anche da tastiera; il click sulla riga conserva la stessa azione.
`assets/scss/_racing-data.scss` definisce font, colori, spaziature, linee,
filtri, badge e tabella riutilizzabili. PaginationControls espone variante racing.
Righe 38px, separazione giorni 26px, testo 13px, contenitore 1120px incluso
padding. Su schermi stretti la tabella scorre orizzontalmente in una
regione accessibile da tastiera; i filtri vanno a capo.

## Dati e stati
Gateway/pager esistenti, 25 record per pagina, filtro hideEmpty sempre true
anche lato server. Q/R mancanti restano trattini. Caricamento, vuoto, offline
ed errore con retry distinti. Nessuna nuova lettura raw o modifica della cache.

## Verifica
10 test mirati, typecheck, lint e pipeline PASS. Osservata la nuova lista
in Electron a 1402px, con dati reali e sfondo visibile. QA interattiva completa
rinviata per uso concorrente della finestra da parte dell'utente; green gate
integrale non eseguito in questa iterazione. Candidato implemented-not-verified.
