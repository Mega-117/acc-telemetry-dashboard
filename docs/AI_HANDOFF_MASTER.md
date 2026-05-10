# AI Handoff Master

Ultimo aggiornamento: 2026-05-10 (Europe/Rome) - update panoramica reminder gara
Repo: `acc-telemetry-dashboard` (scope corrente: Nuxt front-end)

## Scope Confermato
- In questa sessione sono state fatte modifiche solo nel front-end Nuxt.
- Logger locale/desktop wrapper restano fuori da questa patch.

## Decisioni Bloccate (Confermate)
- Overlay: UX ottimizzata per leggibilita, compattezza e fruibilita in uso reale.
- Anti-cheat step: avanzamento manuale consentito solo per step con durata `<= 5` minuti.
- Auto-opacita in running:
  - dopo 10s dall'inizio step: opacita al 60%;
  - ultimi 10s dello step: ritorno al 100%;
  - hover/focus sopra la card: forzata al 100%.
- Audio fine-step: pattern 9 beep totali (`3 + pausa + 3 + pausa + 3`) con volume aumentato.

## Modifiche Nuxt Effettuate
File principale toccato:
- `nuxt/app/pages/training-overlay.vue`
- `nuxt/app/components/pages/PanoramicaPage.vue`

Interventi applicati:
- Rimosso hint testuale `Ctrl+K` dalla header card.
- Aggiunto bottone chiusura `X` piccolo in alto a destra.
- Rifinito stile bottone `X` con forma piu tonda/circolare.
- Rimosso label `PRONTO` nella top line (non necessario alla UX attuale).
- Migliorate dimensioni testo/spaziature HUD in running (titolo, step, task, timer, progress, bottoni).
- Migliorate transizioni tra stati/step per renderle piu fluide e sequenziali (out-in).
- Ridotto vuoto nella vista select; card resa piu content-driven.
- Gestione apertura impostazioni con espansione verticale senza taglio contenuti.
- Aggiunta impostazione utente `Opacita auto` (persistita nelle preferenze).
- Aggiunto comportamento hover/focus che annulla temporaneamente la dim automatico.
- Regola logica `Next`:
  - il pulsante compare solo se lo step corrente e `<= 5 min`;
  - guardia anche lato logica (non solo UI) per impedire skip impropri.
- Audio fine step aggiornato a 9 beep e gain incrementato.

Interventi panoramica (desktop reminder gara, solo UI/manuale):
- Box "Lettura recente" trasformato in card con 2 viste switchabili:
  - `Lettura` (contenuto originale stato pilota);
  - `Prossima gara` (reminder operativo).
- Aggiunto segmented control per passare tra le 2 viste.
- Vista "Prossima gara" include:
  - prossima gara reale dal calendario utente/pilota;
  - stato piano (`Ritardo`, `In linea`, `Avanti`);
  - metriche `target`, `registrati (ultimi 7g)`, `restanti`;
  - progress bar visiva.
- Persistenza locale lato browser (`localStorage`) per mantenere:
  - vista selezionata (`Lettura` / `Gara`).
- Nessun backend nuovo, nessuna integrazione telemetria nuova, nessun impatto su logger.
- Refinement UX successivo (stile piu pulito):
  - rimosse frecce laterali nel box (navigazione unica via segmented control);
  - header semplificato (`Focus gara`) con switch in posizione piu coerente;
  - ridotte ridondanze testuali (`chip stato` + micro-copy operativo, senza doppioni lunghi);
  - KPI gara compattati su `target` e `registrati`, con `restanti` come informazione derivata;
  - palette/contrasti del box destra alleggeriti per ridurre rumore visivo.
- Aggancio calendario reale:
  - la card legge la prossima gara da `users/{uid}/raceCalendar` tramite `loadRaceCalendarEvents`;
  - visualizza il primo evento futuro disponibile (fallback su primo evento valido se non ci sono eventi futuri).
- Terminologia piano:
  - sostituito il lessico "sessioni" con "allenamenti" nel piano gara.
- Gestione obiettivi focus pre-gara:
  - due sezioni read-only `Gia lavorato` / `Da lavorare`;
  - `Gia lavorato` derivato dall'attivita recente (practice/qualify/race);
  - `Da lavorare` derivato dallo scenario briefing consigliato (coach insights).

## TODO Logger/Altri Progetti (Solo Note, Nessuna Patch Qui)
- Se serve coerenza cross-progetto:
  - replicare la regola anti-skip `Next <= 5 min` anche nella shell desktop (se presente logica duplicata);
  - allineare preferenze overlay (chiavi e default) in eventuali progetti che leggono/scrivono le stesse impostazioni;
  - verificare che il bridge Electron esponga correttamente eventuali nuovi campi preferenze usati dal Nuxt.
- Nessuna modifica logger applicata in questa sessione.

## Stato Piano "Best Gara Unico > 40L"
- In questa sessione non sono stati toccati i file dati/telemetria relativi a:
  - `sessionParser.ts`
  - `useTelemetryData.ts`
  - `TrackDetailPage.vue`
- Quindi la parte "best gara unico con soglia `lap.fuel_start > 40.0`" e da considerare **non implementata qui** e da pianificare in task dedicato.

## Checklist Anti-Conflitto (Da Rieseguire in Ogni Repo)
- Confermare scope prima di patchare (Nuxt vs logger vs desktop wrapper).
- Evitare rinomine campi/chiavi non indispensabili.
- Evitare fallback legacy che reintroducono comportamenti vecchi.
- Verificare effetti collaterali su persistenza settings.
- Verificare transizioni/UI anche con viewport ridotte.

## Test Minimi Consigliati (Overlay)
- Avvio allenamento: verifica leggibilita in running/paused/expired/completed.
- Step > 5 min: `Next` non visibile e non eseguibile manualmente.
- Step <= 5 min: `Next` visibile e funzionante.
- Auto-opacita ON:
  - 0-10s: 100%;
  - fase centrale: 60%;
  - ultimi 10s: 100%;
  - hover card in fase 60%: ritorno immediato a 100%.
- Auto-opacita OFF: nessun dimming.
- Fine step: sequenza audio 9 beep percepibile e volume superiore alla versione precedente.

## Test Minimi Consigliati (Panoramica Reminder)
- Vista desktop `/panoramica`: il box a destra mostra switch `Lettura / Prossima gara`.
- Switch vista via segmented funzionante e fluido.
- Nessun controllo manuale di incremento/decremento presente nel box.
- Stato (`Ritardo / In linea / Avanti`) e progress bar aggiornati coerentemente al target.
- La prossima gara visualizzata coincide con il primo evento futuro del calendario.
- Le sezioni `Gia lavorato` e `Da lavorare` risultano coerenti con attivita recente + scenario suggerito.
- Preferenza della vista reminder persiste dopo refresh (localStorage) e non impatta altri moduli.

## Note Operative
- Per il passaggio ad altre repo, copiare questo file e mantenere una sezione "Delta locale" con i soli adattamenti specifici del progetto.
