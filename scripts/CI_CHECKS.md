# Controlli CI condivisi

`ci-checks.json` definisce comandi, directory e timeout dei controlli bloccanti.
`ci_checks.py` li esegue sia in GitHub Actions sia nel green gate desktop.
Un nuovo controllo va aggiunto al manifest, non duplicato nei due consumer.

Prerequisiti: Node dalla `.node-version` sul PATH, Python dalla `.python-version`,
PowerShell 7 (`pwsh`) e Java 21. Nel repository frontend:

```text
python -m pip install -r requirements-ci.txt
```

Nella directory `nuxt`, installare le dipendenze con `npm ci`. Tornati nella root:

```text
python scripts/ci_checks.py --group all
```

`--group frontend` esegue typecheck, pipeline, unit test e coverage con emulatore
RTDB demo. `--group python` esegue flake8 e pytest. `--list` mostra il piano senza
eseguirlo. Il gate desktop richiama entrambi e conserva i controlli aggiuntivi
Electron/logger/emulatori e il lint FE KNOWN esplicito.

Il runner rifiuta versioni Node/Python e dipendenze Python diverse da quelle
dichiarate. Su Windows invoca npm col Node selezionato, evitando il Node implicito
accanto a `npm.cmd`; anche la pipeline PowerShell usa il PATH.
I test che richiedono API browser dichiarano `@vitest-environment jsdom`.

Ogni errore viene riportato nel riepilogo anche se i controlli successivi passano.
Solo pytest exit 5 (nessun test raccolto), se dichiarato, puo' essere neutro;
exit 1 e timeout restano bloccanti. Un timeout chiude soltanto l'albero di processi
avviato dal runner. Non eseguire i test su porte emulatori occupate da altri task.

Il verde locale e' il prerequisito: prima di considerare verificata la pubblicazione,
controllare anche Actions sullo stesso SHA. Il runner non esegue generate o deploy;
Cloudflare/Pages restano subordinati ai due job CI verdi.
