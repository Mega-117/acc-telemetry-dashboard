# Panoramica Racer Core — PIP-422

## Scopo
Il pilota ACC ritrova ultima sessione, riferimenti della pista, prossima gara e allenamento dalla dashboard desktop.

## Utente
Pilota di sim racing davanti al monitor del PC, prima o dopo una sessione.

## Principi
1. Il mockup utente del 16 settembre 2026 guida la composizione: due colonne, immagine dominante a sinistra, tre pannelli a destra.
2. I dati restano canonici; i valori mancanti non diventano record inventati.
3. Lo sfondo deve attraversare pannelli e tabella: niente riempimenti opachi o vetro sfocato.
4. Rosso per azioni e selezione, blu/giallo/rosso per Practice/Qualify/Race.
5. Maiuscolo sportivo, angoli tagliati e particelle lente sono richieste esplicite; rispettare reduced-motion e focus da tastiera.

## Successo
La prima schermata mostra la composizione completa a 1400×900; pista, sessione, TrackTitan e gestione gara sono raggiungibili e funzionanti.

## Limiti
- Prima esplorazione del tema, confinata alla Panoramica e alla sua shell.
- Nessuna riscrittura di parser, regole best, sincronizzazione o autorizzazioni.
- Nessuna integrazione o pubblicazione prima della valutazione utente.

## Token
Font display locale Chakra Petch Bold Italic (`Racer Display`), testo Segoe UI/Inter esistente. Fondo #020202, testo #f5f5f5, bordi #b4b4b4, rosso #ff0024. Spazi 12/16/18/24px; pannelli rettilinei e pulsanti con taglio 10px. Colori attività #0076ff, #e7ff00, #ff0024.
