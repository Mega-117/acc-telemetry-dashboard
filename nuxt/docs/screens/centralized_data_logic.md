# Logica Dati Centralizzata - ACC Telemetry Dashboard

> **Ultimo aggiornamento**: Gennaio 2026  
> **File principale**: `app/composables/useTelemetryData.ts`

---

## Architettura Dati

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SORGENTE DATI                                │
├─────────────────────────────────────────────────────────────────────┤
│  📁 File Locali (Electron)     │    ☁️ Firebase (Web)               │
│  telemetry_data/*.json         │    users/{uid}/sessions/           │
│                                │    └── rawChunks                   │
└───────────────┬────────────────┴──────────────┬─────────────────────┘
                │                               │
                ▼                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    useTelemetryData.ts                               │
│                    (COMPOSABLE CENTRALE)                             │
├─────────────────────────────────────────────────────────────────────┤
│  loadSessions()                 → Lista sessioni (metadata)         │
│  fetchSessionFull()             → Dati completi (stints, laps)      │
│  calculateAllBestTimesForTrack()→ Calcola best per grip             │
│  getBestTimesForGrip()          → Best per grip specifico           │
│  getBestAvgRaceForTrack()       → Best avg assoluto                 │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         PAGINE VUE                                   │
├─────────────────────────────────────────────────────────────────────┤
│  PanoramicaPage   → getBestTimesForGrip('Optimum')                  │
│  TrackDetailPage  → calculateAllBestTimesForTrack()                 │
│  SessionDetailPage → fetchSessionFull()                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Funzioni Centralizzate

### `calculateAllBestTimesForTrack(trackId, userId?)`

Calcola **tutti** i best times per una pista, divisi per condizione grip.

**Input**:
- `trackId`: ID della pista (es. 'monza', 'valencia')
- `userId`: (opzionale) ID utente per coach/admin

**Output**:
```typescript
Record<string, {
  bestQualy: number | null      // Miglior giro qualifica
  bestQualyTemp: number | null  // Temperatura aria
  bestRace: number | null       // Miglior giro gara/practice
  bestRaceTemp: number | null   // Temperatura aria
  bestAvgRace: number | null    // Media miglior stint (5+ giri)
  bestAvgRaceTemp: number | null // Temperatura aria
}>
```

**Grip Conditions**: `['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']`

---

### `getBestTimesForGrip(trackId, grip, userId?)`

Wrapper per ottenere i best di un **singolo grip**.

```typescript
const bests = await getBestTimesForGrip('monza', 'Optimum')
// → { bestQualy: 97100, bestRace: 97697, bestAvgRace: null }
```

---

### `getTheoreticalTimes(trackId, grip, stintTemp, userId?)`

Calcola i **tempi teorici** con aggiustamento temperatura (100ms/°C).

```typescript
const theo = await getTheoreticalTimes('valencia', 'Optimum', 28)
// → { theoQualy: 92600, theoRace: 92700, theoAvgRace: 94000, ... }
```

**Usato in**: `SessionDetailPage` per i delta vs teorico.

---

### `getBestAvgRaceForTrack(trackId, userId?)`

Ottiene il miglior avg race **assoluto** (qualsiasi grip).

```typescript
const avg = await getBestAvgRaceForTrack('valencia')
// → 94005 (1:34.005 in ms)
```

---

## Regole di Business

### 1. Filtro Giri Validi

Un giro è valido per i calcoli se:
- `is_valid === true`
- `has_pit_stop === false`
- `lap_time_ms > 0`

### 2. Filtro 5+ Giri per AVG Race

Il `bestAvgRace` viene calcolato **solo** da stint con:
- **Almeno 5 giri validi** consecutivi
- Tipo stint: `Race` o `Practice` (NON `Qualify`)

```typescript
const MIN_VALID_LAPS_FOR_AVG = 5

if (validLaps.length >= MIN_VALID_LAPS_FOR_AVG) {
  // Calcola avg
}
```

### 3. Grip del Giro

Il grip viene determinato dal campo `track_grip_status` di ogni giro.
Per l'avg race si usa il grip del **primo giro valido** dello stint.

---

## Utilizzo nelle Pagine

### PanoramicaPage

Mostra i best times con grip **Optimum** per le ultime 2 piste.

```typescript
const { getBestTimesForGrip } = useTelemetryData()

watch([lastTrack, prevTrack], async () => {
  if (lastTrack.value?.track) {
    const bests = await getBestTimesForGrip(
      lastTrack.value.track, 
      'Optimum',  // Sempre Optimum in Panoramica
      targetUserId.value
    )
    recalculatedByTrack.value[lastTrack.value.track] = bests
  }
})
```

### TrackDetailPage

Mostra i best times per il **grip selezionato** dall'utente.

```typescript
const { calculateAllBestTimesForTrack } = useTelemetryData()

watch(trackSessions, async () => {
  recalculatedBestByGrip.value = await calculateAllBestTimesForTrack(
    props.trackId,
    targetUserId.value
  )
})

// Poi nella computed:
const grip = selectedGrip.value // Es. 'Wet', 'Damp', etc.
const recalcGrip = recalculatedBestByGrip.value[grip]
```

---

## Flusso Dati Completo

```
1. Pagina si carica
   │
   ▼
2. loadSessions() → ottiene lista sessioni (metadata leggero)
   │
   ▼
3. watcher scatta → chiama calculateAllBestTimesForTrack()
   │
   ▼
4. Per ogni sessione della pista:
   │  └── fetchSessionFull() → ottiene dati completi (stints, laps)
   │
   ▼
5. Per ogni stint:
   │  ├── Filtra giri validi
   │  ├── Determina grip dal giro
   │  ├── Aggiorna bestQualy se Qualify
   │  ├── Aggiorna bestRace se Race/Practice
   │  └── Aggiorna bestAvgRace se 5+ giri validi
   │
   ▼
6. Restituisce Record<grip, GripBestTimes>
   │
   ▼
7. Pagina mostra i valori
```

---

## Differenze Electron vs Web

| Aspetto | Electron | Web |
|---------|----------|-----|
| **Sorgente** | File JSON locali | Firebase Firestore |
| **Velocità** | Più veloce (I/O locale) | Dipende da rete |
| **Persistenza** | Sempre disponibile offline | Richiede connessione |
| **Lettura sessione** | `electronAPI.readFile()` | `getDocs(rawChunks)` |

Il composable gestisce automaticamente la selezione della sorgente basandosi su:
```typescript
const isElectron = computed(() => !!(window as any).electronAPI)
```

---

## Best Practices

1. **Usa sempre le funzioni centralizzate** - Non calcolare localmente nelle pagine
2. **Specifica sempre il grip** - Per evitare inconsistenze tra pagine
3. **Considera il caricamento** - Le funzioni sono async, mostra loading states
4. **Cache implicita** - I dati delle sessioni vengono già tenuti in memoria dopo il primo load
