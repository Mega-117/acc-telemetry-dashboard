# Supporto verifica email Firebase Auth

## Stato del sistema

La verifica email degli utenti ACC Telemetry Suite usa Firebase Authentication.

La sorgente di verita e':

- Firebase Authentication -> utente -> `emailVerified`

Non e' sorgente di verita:

- Firestore `users/{uid}.emailVerified`

Quel campo Firestore e' solo uno specchio usato dall'app e puo essere riallineato al valore reale di Firebase Auth. Modificarlo manualmente non verifica davvero l'utente.

## Diagnosi conclusa

Task di riferimento: `PIP-34`.

Evidenze raccolte:

- Export Firebase Auth: 14 utenti totali, 8 non verificati.
- UID analizzato `8IGLdQR5yKOPLGqpyHf6WbrmZ3z1`: `emailVerified=false`, `disabled=false`, nessun doppione email, `lastLoginAt` vuoto.
- Domini autorizzati Firebase controllati: presenti `accsuite117.firebaseapp.com`, `accsuite117.web.app`, `mega-117.github.io`, `localhost`, `127.0.0.1`.
- Template email Firebase ancora default: inglese, mittente `noreply@accsuite117.firebaseapp.com`, oggetto `Verify your email for %APP_NAME%`.
- Test reale browser su produzione GitHub Pages con utente Tiscali `rumbapalo@tiscali.it`:
  - login riuscito;
  - schermata verifica visibile;
  - bottone `Rinvia email di verifica` abilitato;
  - dopo click UI `✓ Email inviata`;
  - console: `[AUTH] Verification email resent`;
  - nessun errore Firebase/rate limit/network.

Conclusione: il frontend e il reinvio Firebase SDK funzionano. Se l'utente non riceve la mail, la causa piu probabile e' deliverability/provider/spam o scarsa riconoscibilita del template Firebase default, non un bug del bottone o della logica frontend.

Limite tecnico: Firebase client SDK prova che la richiesta e' stata accettata, ma non prova la consegna SMTP/inbox.

## Procedura supporto

Quando un utente non riceve la mail:

1. Verificare in Firebase Authentication l'utente per email o UID.
2. Controllare che:
   - `emailVerified=false`;
   - `disabled=false`;
   - non ci siano doppioni con la stessa email.
3. Chiedere all'utente di controllare esattamente la mailbox indicata nell'app.
4. Chiedere di cercare in spam/promozioni/posta indesiderata:
   - `noreply@accsuite117.firebaseapp.com`;
   - `Firebase`;
   - `Verify your email`;
   - `AccSuite`.
5. Far premere `Rinvia email di verifica` dalla schermata app.
6. Se possibile, controllare DevTools console:
   - successo atteso: `[AUTH] Verification email resent`;
   - errore possibile: `[AUTH] Resend error: <codice Firebase>`.

Se il reinvio e' accettato ma l'utente non riceve la mail, trattare il caso come deliverability/spam/provider.

## Tool locale admin

Per i casi in cui l'utente non riesce a completare la verifica autonomamente, e' stato creato e validato un tool locale admin separato dal progetto e poi spostato fuori dal repo per sicurezza.

Il tool usa Firebase Admin SDK con service account privata e permette:

- audit stato utente per UID/email;
- generazione link verifica manuale;
- override controllato `emailVerified=true` su Firebase Auth;
- riallineamento Firestore;
- audit log dell'operazione.

Uso operativo deciso:

1. L'utente prova prima da solo con `Rinvia email di verifica`.
2. Se non riesce, contatta Enrico.
3. Enrico usa il tool locale admin con UID utente, solo dopo conferma identita.

Comando tipo per verifica manuale:

```powershell
node auth-user.mjs verify --uid UID_UTENTE --operator Enrico --reason "Utente confermato manualmente" --confirm
```

Il comando `verify` imposta davvero `emailVerified=true` su Firebase Auth. Non usare Firestore per questa operazione.

## Note future opzionali

Non bloccanti per il funzionamento attuale:

- personalizzare il template email in italiano;
- impostare un nome app/mittente piu riconoscibile;
- aggiornare la UI per dire esplicitamente di cercare `noreply@accsuite117.firebaseapp.com` in spam/promozioni;
- valutare un provider email custom solo se il problema diventa frequente.
