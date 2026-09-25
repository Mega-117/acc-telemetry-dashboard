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
Righe 38px, separazione giorni 36px, testo 13px, contenitore condiviso 1400px incluso
padding. Su schermi stretti la tabella scorre orizzontalmente in una
regione accessibile da tastiera; i filtri vanno a capo.

## Dati e stati
Scorrimento: header e filtri fuori dal viewport scorrevole della lista,
maschera sfumata di 18px sotto i filtri; contenitori esterni clip per impedire
scroll involontari. Cambio pagina scorre solo .sessions-scroll marcato
data-page-scroll, che contiene lista e stati. Paginazione fissa in una riga
separata sotto il viewport: la scrollbar termina sopra il pager.
UiScrollArea mostra la barra durante scroll e la nasconde dopo 650ms inattivi,
con fade 180ms e timer cancellato allo smontaggio. Paginazione con
massimo sette elementi: estremi, vicine alla corrente ed ellissi disabilitate.
Spazio fra giorni 36px. Hover/focus riga bianco gradiente #ffffff16 -> #ffffff09.

Filtri compatti: font condiviso 11px, select chiusa 144px (auto 176px),
testo lungo troncato con ellissi e opzioni native complete. Freccia SVG a
12px dal bordo destro, ripristino freccia nativa in forced-colors.
Spazio sopra il blocco 40px (32px mobile), sotto 42px.

Palette canonica richiesta il 25 settembre: Practice `#0076ff`, Qualify e
tempi Q `#ffc400`, Race e tempi R `#ff0024`. Token globali
`--racing-practice`, `--racing-qualify`, `--racing-race` in `_racing-theme.scss`,
condivisi da Sessioni e Attivita della Panoramica; usarli nel seguito del restyle.

Gateway/pager esistenti, 25 record per pagina, filtro hideEmpty sempre true
anche lato server. Q/R mancanti restano trattini. Caricamento, vuoto, offline
ed errore con retry distinti. Nessuna nuova lettura raw o modifica della cache.

## Verifica
10 test mirati, typecheck, lint e pipeline PASS. Osservata la nuova lista
in Electron a 1402px, con dati reali e sfondo visibile. QA interattiva completa
rinviata per uso concorrente della finestra da parte dell'utente; green gate
integrale non eseguito in questa iterazione. Candidato implemented-not-verified.
