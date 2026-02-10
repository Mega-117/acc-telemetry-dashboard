---
description: Debug and test workflow for ACC Suite webapp pages
---

# Debug Testing Workflow

Questo workflow descrive come eseguire e verificare i test automatici della webapp ACC Suite.

## Prerequisiti

1. Ambiente di sviluppo attivo (`npm run dev`)
2. Browser con console aperta (F12)
3. Dati di test disponibili (sessioni su Firebase)

## Flusso Automatico (DEV Mode)

In modalità sviluppo, i test vengono eseguiti automaticamente al caricamento di ogni pagina.

### SessionDetailPage
- Naviga a `/sessioni/{sessionId}`
- Attendi caricamento completo
- Cerca in console: `[DEBUG] SessionDetailPage:`
- Test eseguiti:
  - Best lap calculation (per stint)
  - Avg >= Best validation
  - Valid laps count
  - Delta vs Theo calculation
  - Critical fields check
  - Duration from JSON
  - Session type consistency
  - Lap numbers sequential

### TrackDetailPage
- Naviga a `/piste/{trackId}`
- Attendi caricamento dati recalcolati
- Cerca in console: `[DEBUG] TrackDetailPage:`
- Test eseguiti:
  - Session count match
  - Activity totals sum
  - Best times match recalculated
  - Track fields validation
  - Sessions sorted descending

## Interpretazione Output Console

### ✅ Tutti i test passati
```
[DEBUG] SessionDetailPage: 15/15 tests passed
```
Background verde, nessuna azione richiesta.

### ⚠️ Warning presenti
```
[DEBUG] SessionDetailPage: 13/15 tests passed
```
Background arancione, espandi dettagli per vedere warnings.

### ❌ Errori critici
```
[DEBUG] SessionDetailPage: 10/15 tests passed
```
Background rosso, errori richiedono attenzione immediata.

## Analisi Errori

Per ogni test fallito viene mostrato:
- **Nome test**: quale validazione è fallita
- **Expected**: valore atteso
- **Actual**: valore effettivo
- **Note**: informazioni aggiuntive (se presenti)

### Esempio output dettagliato
```
[DEBUG] SessionDetailPage - Details
❌ Stint 1: Best Lap Calculation
   Expected: 99607
   Actual:   99608
   Note: Difference: 1ms
⚠️ Stint 2: Valid Laps Count
   Expected: 12
   Actual:   11
```

## Debug Manuale

Se i test automatici non sono sufficienti:

// turbo-all
1. Aprire Vue DevTools
2. Navigare al componente della pagina
3. Leggere lo stato reattivo (`session`, `track`, ecc.)
4. Confrontare con dati sorgente Firebase (tab Network o Firestore console)

## Aggiungere Nuovi Test

Modificare `useDebugValidator.ts`:

1. Aggiungere test function in `validateSessionDetail()` o `validateTrackDetail()`
2. Usare struttura standard:
```typescript
results.push({
  name: 'Nome Test',
  passed: condition,
  expected: valorePrevisto,
  actual: valoreEffettivo,
  severity: 'error' | 'warning' | 'info'
})
```

## Pagine con Validazione Attiva

| Pagina | Composable | Test Count |
|--------|------------|------------|
| SessionDetailPage | runSessionValidation | ~20 |
| TrackDetailPage | runTrackValidation | ~10 |
| PanoramicaPage | (da aggiungere) | - |
| SessioniPage | (da aggiungere) | - |
| PistePage | (da aggiungere) | - |
