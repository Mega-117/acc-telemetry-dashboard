# Chatterbox Voice Lab (PIP-269)

Sandbox locale e solo sviluppo per confrontare Chatterbox Multilingual V3 con
Kokoro. Non viene inclusa nella build statica e non partecipa alla voce in pista.

## Preparazione

Dalla root `acc-telemetry-dashboard/`, crea l'ambiente locale isolato:

```powershell
python -m venv training_data/chatterbox_venv
training_data\chatterbox_venv\Scripts\python.exe -m pip install -r nuxt\scripts\requirements-chatterbox.txt
```

Il Voice Lab rileva automaticamente questo interprete; non modifica il Python globale.
Il requirements e' fissato a un commit ufficiale che include Multilingual V3,
perche' la wheel PyPI 0.1.7 espone ancora soltanto il checkpoint V2.
Avvia poi normalmente Nuxt e apri `Voice Lab > Chatterbox`. La prima apertura
scarica i pesi del modello e puo' richiedere diversi minuti. Il device e'
selezionato automaticamente (`cuda` quando disponibile, altrimenti `cpu`); per
forzarlo imposta `ACC_CHATTERBOX_DEVICE=cpu` oppure `cuda` prima di avviare Nuxt.

## Voci italiane locali

La voce `Predefinita Chatterbox` non richiede campioni. Per aggiungere identita'
vocali, copia file `.wav` italiani in:

```text
acc-telemetry-dashboard/training_data/chatterbox_voices/
```

Premi `Aggiorna voci`: ogni WAV appare nel pannello usando il nome del file come
etichetta. Il file deve contenere una singola voce pulita; il testo generato usa
sempre `language_id="it"`. La cartella e' locale e ignorata da Git.

## Tonalita' italiana

Multilingual V3 non supporta i tag paralinguistici di Turbo/Nano. Il Voice Lab
usa invece due parametri reali del modello, sempre validati nel range 0...1:

- `exaggeration`: intensita' espressiva;
- `cfg_weight`: aderenza al campione e influenza sul ritmo.

I quattro preset sono la fonte condivisa tra UI e server:

| Preset | Exaggeration | CFG weight |
|---|---:|---:|
| Naturale | 0.50 | 0.50 |
| Calma | 0.35 | 0.60 |
| Energica | 0.70 | 0.30 |
| Drammatica | 0.85 | 0.25 |

Gli slider consentono regolazioni personalizzate. L'anteprima resta temporanea.

Varianti utili:

- `ACC_CHATTERBOX_VOICES_DIR`: cartella campioni diversa;
- `ACC_CHATTERBOX_PYTHON`: interprete Python diverso da `python`;
- `ACC_CHATTERBOX_TEMP_DIR`: cartella temporanea diversa.

I log di avvio sono `nuxt/chatterbox_tts_out.log` e
`nuxt/chatterbox_tts_err.log`.

## Rimozione completa

La sandbox e' confinata per essere reversibile. Per rimuoverla:

1. elimina il tab, `ChatterboxVoiceLabPanel.vue`, `ChatterboxProsodyControls.vue`
   e `shared/chatterboxProsody.ts`;
2. elimina `server/api/dev/chatterbox-*` e `server/utils/chatterbox*`;
3. elimina `scripts/chatterbox_tts_server.py`, il requirements e i relativi test;
4. rimuovi le voci Chatterbox dalla include-list coverage;
5. facoltativamente elimina `training_data/chatterbox_voices/` e la cache del
   modello Chatterbox/Hugging Face.

Kokoro, i WAV pregenerati e il runtime audio in pista non richiedono migrazioni.
