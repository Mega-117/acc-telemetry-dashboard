# Prompt per generare una web app front-end per team di sim racing

Usa questo prompt con un modello AI capace di progettare e generare interfacce front-end. Non usare nomi di prodotto specifici: mantieni il progetto generale, professionale e adattabile a qualsiasi team di sim racing.

```text
Devi progettare e realizzare il front-end di una web app desktop-first per un team professionale di sim racing.

L'obiettivo non e' creare funzionalita' backend reali, database, autenticazione reale o integrazioni complete. L'obiettivo e' immaginare, progettare e implementare un prototipo front-end credibile, completo e navigabile che mostri come potrebbe funzionare una piattaforma unica per piloti, coach e staff di un team di sim racing.

Mantieni il nome del prodotto generico. Non usare nomi proprietari o riferimenti a brand specifici. L'app deve sembrare una piattaforma professionale per la gestione sportiva, tecnica e operativa di un team di sim racing.

## Contesto

La piattaforma deve servire un team di sim racing serio, strutturato in modo simile a un piccolo team motorsport/e-sport. Deve essere usata da piu' figure:

- Piloti
- Coach dei piloti
- Team manager
- Race engineer / ingegnere di pista
- Strategist / responsabile strategia
- Event manager / staff calendario gare
- Performance analyst
- Admin o owner del team

Devi ragionare su come lavora oggi un team di sim racing professionale: preparazione eventi, allenamenti, analisi sessioni, confronto tra piloti, gestione calendario, briefing, debriefing, obiettivi di crescita, scelta auto/pista, gestione lineup, comunicazioni interne, preparazione gara, strategia, condizioni meteo, grip, stint, costanza e performance.

La piattaforma deve unire questi flussi in un unico punto semplice. La priorita' assoluta e' la semplicita': ogni ruolo deve trovare subito cio' che gli serve, senza un'interfaccia caotica.

## Dati disponibili

Puoi basarti solo su questi dati reali o simulati:

- Tempi sul giro
- Tempi nei settori
- Nome pista
- Vettura usata
- Temperatura aria
- Temperatura pista
- Condizione meteo
- Condizione grip
- Sessioni di allenamento, qualifica o gara
- Pilota associato alla sessione
- Data e durata della sessione

Non e' disponibile telemetria curva per curva, quindi non progettare schermate che dipendono da canali avanzati come freno, acceleratore, sterzo, velocita' curva per curva, traiettoria GPS, marce, pressione freno, slip angle o dati motore dettagliati.

Se vuoi proporre insight tecnici, devono essere derivabili dai dati disponibili. Esempi validi:

- Miglior giro personale
- Miglior settore
- Giro teorico costruito dai migliori settori
- Delta tra piloti
- Delta tra sessioni
- Costanza sul passo
- Distribuzione dei tempi
- Evoluzione dei tempi nel tempo
- Confronto per pista, auto, meteo e grip
- Obiettivi di allenamento basati su gap nei settori
- Andamento di forma del pilota
- Preparazione evento basata su storico pista/auto

## Compito principale

Prima di progettare l'interfaccia, analizza e sintetizza:

1. Quali ruoli esistono in un team di sim racing professionale.
2. Quali responsabilita' ha ogni ruolo.
3. Quali flussi di lavoro ricorrenti esistono durante:
   - una giornata normale di allenamento;
   - una settimana di preparazione gara;
   - il weekend di gara;
   - il periodo tra una gara e l'altra;
   - una stagione intera.
4. Quali strumenti usano oggi team e piloti: calendari, fogli di calcolo, Discord/Teams, note, replay, risultati gara, dashboard timing, tool di setup, tool di coaching.
5. Quali problemi nascono quando questi strumenti sono separati.
6. Come una web app unica potrebbe semplificare il lavoro senza diventare troppo complessa.

Dopo questa analisi, progetta il front-end della piattaforma.

## Requisiti dell'app

Crea una web app desktop-first, responsive, pensata per funzionare bene come applicazione desktop. Deve avere:

- Login fittizio o selezione ruolo fittizia.
- Dashboard generale.
- Navigazione principale chiara.
- Viste diverse o adattate per ogni ruolo.
- Dati demo realistici.
- Stati vuoti, loading e feedback visivi dove utile.
- Nessuna dipendenza da backend reale.
- Nessun database reale.
- Nessuna autenticazione reale.
- Nessuna chiamata API obbligatoria.

La piattaforma deve includere almeno queste aree funzionali:

### 1. Login e selezione ruolo

Implementa un ingresso fittizio che permetta di scegliere un profilo demo:

- Pilota
- Coach
- Team manager
- Ingegnere di pista
- Strategist
- Admin

Ogni profilo deve mostrare una dashboard coerente con il ruolo.

### 2. Dashboard principale

La dashboard deve dare una visione immediata dello stato del team:

- Prossimi eventi
- Sessioni recenti
- Piloti attivi
- Miglioramenti recenti
- Alert o priorita'
- Obiettivi settimanali
- Preparazione gara in corso
- Stato allenamenti

### 3. Area pilota

Il pilota deve poter vedere:

- Propri tempi recenti
- Miglior giro per pista e auto
- Settori migliori
- Giro teorico
- Andamento della costanza
- Obiettivi assegnati dal coach
- Programma allenamento
- Storico sessioni
- Preparazione prossima gara
- Note ricevute dal coach

Evita schermate troppo tecniche basate su telemetria non disponibile. Concentrati su progressione, obiettivi, ritmo, consistenza e confronto con benchmark del team.

### 4. Area coach

Il coach deve poter:

- Vedere elenco piloti seguiti
- Confrontare piloti sulla stessa pista/auto
- Analizzare gap nei settori
- Assegnare obiettivi di allenamento
- Pianificare sessioni di coaching
- Preparare briefing e debriefing
- Annotare problemi ricorrenti
- Seguire evoluzione prestazioni nel tempo

La schermata coach deve sembrare uno strumento operativo, non una dashboard generica.

### 5. Area team manager / admin

Il team manager deve poter:

- Vedere calendario gare e allenamenti
- Gestire lineup piloti per evento
- Vedere disponibilita' piloti
- Monitorare stato preparazione di ogni pilota
- Coordinare coach, strategist e ingegneri
- Vedere priorita' organizzative
- Controllare panoramica della stagione

### 6. Area strategia gara

Lo strategist deve poter lavorare su:

- Evento selezionato
- Pista, auto, condizioni meteo e grip previste
- Stint plan dimostrativo
- Note strategiche
- Checklist gara
- Confronto passo piloti
- Rischi e opportunita'

Usa dati fittizi ma credibili. Non serve calcolare strategie reali: serve mostrare l'interfaccia e il workflow.

### 7. Area ingegnere di pista / performance

L'ingegnere deve poter vedere:

- Performance per pista e auto
- Confronto dei settori
- Effetto meteo/grip sui tempi
- Sessioni piu' rappresentative
- Benchmark interni del team
- Raccomandazioni basate su trend semplici

Non usare dati di setup avanzato se non come note testuali o checklist dimostrative.

### 8. Eventi, calendario e preparazione gara

Crea una vista evento con:

- Dettagli gara
- Piloti assegnati
- Coach responsabile
- Sessioni di preparazione
- Checklist operativa
- Obiettivi per ogni pilota
- Note briefing
- Stato readiness del team

### 9. Sessioni e analisi performance

Crea una vista sessioni con:

- Lista sessioni filtrabile
- Dettaglio sessione
- Tempi giro
- Settori
- Condizioni aria/pista/meteo/grip
- Confronti base
- Grafici semplici e leggibili

I grafici devono essere pensati per aiutare decisioni pratiche, non per mostrare complessita' inutile.

## Filosofia UX/UI

La piattaforma deve sembrare professionale, pulita, moderna e concreta. Deve essere piu' simile a un software operativo per team sportivi che a una landing page.

Linee guida:

- Niente homepage marketing.
- La prima schermata dopo il login deve essere subito utile.
- Interfaccia densa ma leggibile.
- Priorita' alla scansione veloce delle informazioni.
- Navigazione stabile e prevedibile.
- Usa card solo per elementi ripetuti o contenuti realmente incorniciati.
- Evita decorazioni inutili.
- Evita palette monotone basate su un solo colore.
- Usa tabelle, filtri, tab, grafici, checklist, badge di stato e pannelli contestuali.
- Ogni ruolo deve avere una vista pensata per il suo lavoro reale.
- Il design deve funzionare bene su desktop, ma restare usabile su tablet e mobile.

## Output richiesto

Realizza il front-end completo del prototipo con dati demo. Se il contesto lo consente, usa componenti moderni e un'architettura pulita.

L'output deve includere:

1. Una breve analisi iniziale dei ruoli e dei workflow del team.
2. Una proposta di architettura dell'interfaccia.
3. Il codice front-end del prototipo.
4. Dati fittizi realistici.
5. Login/selezione ruolo fittizia.
6. Dashboard e viste operative per i ruoli principali.
7. Grafici e tabelle coerenti con i dati disponibili.
8. Nessun backend reale richiesto.
9. Nessun database reale richiesto.

## Vincoli importanti

- Non inventare telemetria curva per curva.
- Non progettare funzionalita' che richiedono dati non disponibili, a meno che siano chiaramente marcate come placeholder futuro.
- Non rendere l'app una semplice dashboard generica: deve sembrare fatta per un team di sim racing.
- Non usare il nome di un prodotto specifico.
- Non creare una landing page.
- Non concentrarti solo sui piloti: includi anche coach, manager, strategist, ingegneri e admin.
- Non creare un'interfaccia troppo complessa: la semplicita' e' il requisito principale.

## Obiettivo finale

Il risultato deve essere una base front-end credibile per una futura web app desktop usata da tutti i membri di un team di sim racing. Deve aiutare il team a preparare gare, allenare piloti, leggere performance, coordinare persone e trasformare dati semplici come tempi giro, settori, pista, auto, meteo e grip in decisioni operative chiare.
```
