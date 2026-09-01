# Product purpose

ACC Suite aiuta piloti e ingegneri di sim racing a leggere la gara e prendere decisioni operative senza uscire dal contesto di guida.

# Primary user

Un pilota o race engineer ACC che usa soprattutto un desktop 16:9 durante sessioni lunghe e deve comprendere stato e azione primaria in pochi secondi.

# Principles

1. **La decisione viene prima del cruscotto.** Stato corrente e azione primaria devono essere visibili senza attraversare pannelli decorativi.
2. **La struttura non si muove sotto pressione.** Colonne, righe MFD e controlli mantengono posizione e ordine tra stati.
3. **Una persona o un dato appare una volta.** Le azioni duplicate si rimuovono o si collocano nel contesto più vicino.
4. **Il colore significa qualcosa.** Rosso/arancio indica azione, verde stato live, viola accesso temporaneo; il resto resta neutro.
5. **Desktop prima, riduzione prima del collasso.** Il layout sfrutta la larghezza 16:9 e compatta densità e chrome prima di impilare le colonne.

# Success metric

Da Pit Wall l’utente individua chi può assistere e avvia il live entro 10 secondi; nel live distingue Timing, MFD e azione di invio senza cercare controlli fuori contesto.

# Out of scope

- Non definisce logiche Firebase, telemetria, IPC o autorizzazioni reali.
- Non sostituisce la vista Pit Wall Classica.
- Non aggiunge animazioni decorative o dashboard secondarie.
- Non nasconde campi MFD richiesti dal gioco.

# Learned constraints

- **2026-09-01** — Il Concept deve essere più semplice del mockup iniziale: righe fisse, poche superfici e nessuna duplicazione tra strategia e MFD. *Perché:* durante la gara l’utente deve confrontare e agire, non interpretare il layout.
- **2026-09-01** — Il desktop 16:9 è la superficie prioritaria e lo spazio laterale va usato, non riempito con colonne alte artificialmente. *Perché:* l’app è una control room, non una pagina mobile ingrandita.
- **2026-09-01** — Il Concept deve dare respiro attraverso proporzioni, raggruppamento e sottrazione dei contenitori, non comprimendo tutte le righe. Lo stile racing tecnologico viene da griglia, ritmo e tipografia dati; non da glow, neon o decorazioni aggiuntive. *Perché:* l’interfaccia deve restare leggibile a colpo d’occhio durante una gara.
- **2026-09-01** — La Home Concept non usa un titolo duplicato e separa tre responsabilità: directory persone a sinistra, Crew e ultimi cinque collegamenti a destra. La ricerca restituisce solo ciò che è stato cercato; i Recenti non diventano una lista amici e mostrano soltanto nickname, iniziali e azione contestuale. Le Crew usano esclusivamente una copertina scelta tra sei preset locali e non mostrano presenza aggregata. *Perché:* evita liste ibride, nuove logiche social e costi di presenza non necessari.
