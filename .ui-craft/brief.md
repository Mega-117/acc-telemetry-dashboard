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

- **2026-09-01** — Nella pagina Crew, `Assisti` resta l’unica azione primaria della riga. Solo il proprietario vede un controllo `•••` discreto nella colonna identità dei membri; il controllo sostituisce temporaneamente il pannello destro con il dettaglio membro e richiede conferma prima della rimozione. Non esiste una modalità globale da chiudere e nome/descrizione non sono modificabili dopo la creazione. *Perché:* la gestione è rara e potenzialmente distruttiva, quindi deve essere visibile senza competere con l’azione operativa né lasciare stati nascosti attivi.
- **2026-09-01** — Nei Recenti, `Accesso permanente` usa un indicatore ciano e `Accesso temporaneo` uno viola, mantenendo sempre il testo esplicito. Le righe sono compatte e il primo utente senza accesso è separato soltanto da un piccolo spazio. Gli accordion Crew seguono fluidamente l'altezza reale del roster, senza scatti, e il pulsante `Crea` si allinea otticamente al titolo. *Perché:* colore e ritmo accelerano la scansione, ma nessuna informazione deve dipendere dal solo colore o da separatori aggiuntivi.
- **2026-09-01** — Le card Crew nella Home sono disclosure inline: una sola si apre alla volta, mostra un roster compatto con `Collegati`, mentre `Apri Crew` resta separato per la gestione completa. La membership equivale ad accesso permanente e non richiede presenza online. *Perché:* consente di raggiungere un membro in due click senza aggiungere Firebase, menu o sottopagine intermedie.
- **2026-09-01** — Directory e Recenti espongono soltanto `Accesso permanente`, `Accesso temporaneo` o nessuna etichetta; le richieste in attesa non appartengono ai Recenti. Chi ha accesso usa `Collegati`, gli altri un solo `Richiedi accesso` con scelta temporanea/permanente. *Perché:* una persona deve avere un solo stato leggibile e una sola azione contestuale.
- **2026-09-01** — Il Concept deve essere più semplice del mockup iniziale: righe fisse, poche superfici e nessuna duplicazione tra strategia e MFD. *Perché:* durante la gara l’utente deve confrontare e agire, non interpretare il layout.
- **2026-09-01** — Il desktop 16:9 è la superficie prioritaria e lo spazio laterale va usato, non riempito con colonne alte artificialmente. *Perché:* l’app è una control room, non una pagina mobile ingrandita.
- **2026-09-01** — Il Concept deve dare respiro attraverso proporzioni, raggruppamento e sottrazione dei contenitori, non comprimendo tutte le righe. Lo stile racing tecnologico viene da griglia, ritmo e tipografia dati; non da glow, neon o decorazioni aggiuntive. *Perché:* l’interfaccia deve restare leggibile a colpo d’occhio durante una gara.
- **2026-09-01** — La Home Concept non usa un titolo duplicato e separa tre responsabilità: directory persone a sinistra, Crew e ultimi cinque collegamenti a destra. La ricerca restituisce solo ciò che è stato cercato; i Recenti non diventano una lista amici e mostrano soltanto nickname, iniziali e azione contestuale. Le Crew usano esclusivamente una copertina scelta tra sei preset locali e non mostrano presenza aggregata. *Perché:* evita liste ibride, nuove logiche social e costi di presenza non necessari.
