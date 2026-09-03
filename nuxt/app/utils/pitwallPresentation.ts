// ============================================
// Pitwall presentation - logica pura del pannello ingegnere di pista.
// Nessun I/O: la pagina raccoglie i valori, questo modulo li normalizza
// e li trasforma nel riepilogo mostrato a schermo.
// ============================================

export const PITWALL_WHEELS = ['FL', 'FR', 'RL', 'RR'] as const

export type PitwallWheel = (typeof PITWALL_WHEELS)[number]

export const PITWALL_PRESSURE_STEP_PSI = 0.1
// 20,3 e' il fondo corsa vero del Pit MFD di ACC, non un 20 arrotondato: sotto
// quella soglia le frecce del gioco non scendono. Lasciar comporre un valore
// piu' basso vorrebbe dire mandare al pilota un ordine irraggiungibile, che
// fallirebbe la verifica su un bersaglio che ACC non puo' raggiungere.
export const PITWALL_PRESSURE_MIN_PSI = 20.3
export const PITWALL_PRESSURE_MAX_PSI = 35

export const PITWALL_FUEL_STEP_L = 1
export const PITWALL_FUEL_MIN_L = 0
export const PITWALL_FUEL_MAX_L = 140

export const PITWALL_TYRE_SET_MIN = 1
export const PITWALL_TYRE_SET_MAX = 50

/**
 * Le strategie di sosta salvate nell'assetto.
 *
 * Il massimo non e' un limite di ACC: e' quanto in basso ha senso scendere per
 * ritrovare la prima, visto che il gioco non pubblica su quale strategia sei.
 */
export const PITWALL_PIT_STRATEGY_MIN = 1
export const PITWALL_PIT_STRATEGY_MAX = 10

/** Le mescole dei freni nel Pit MFD: quattro, davanti e dietro. */
export const PITWALL_BRAKE_COMPOUND_MIN = 1
export const PITWALL_BRAKE_COMPOUND_MAX = 4

export const PITWALL_COMPOUNDS = ['dry', 'wet'] as const

export type PitwallCompound = (typeof PITWALL_COMPOUNDS)[number]

export interface PitwallDriver {
  id: string
  name: string
}

/** L'ordine che l'ingegnere sta componendo: cosa vorrebbe avere la macchina. */
export interface PitwallPlan {
  /**
   * Il preset di strategia da selezionare, oppure null per non toccarlo.
   *
   * Sta in cima come nel Pit MFD, ed e' l'unico campo che riscrive tutti gli
   * altri: sceglierlo significa accettare i valori del preset per carburante,
   * gomme e pressioni.
   */
  pitStrategy: number | null
  pressures: Record<PitwallWheel, number>
  fuelLiters: number
  compound: PitwallCompound
  tyreSet: number
  /**
   * Le caselle del Pit MFD hanno **tre** stati, non due.
   *
   * `true` accendi, `false` spegni, `null` non toccare. Prima erano booleane e
   * una casella vuota voleva dire "non toccare": l'ingegnere non poteva quindi
   * spegnere niente, e cio' che impostava non era mai riportato fedelmente.
   */
  changeTyres: boolean | null
  driverId: string | null
  /** Sostituzione freni: una casella, come le riparazioni. */
  brakes: boolean | null
  /**
   * Le mescole dei freni, davanti e dietro, da 1 a 4.
   *
   * Esistono solo con la sostituzione freni accesa: sono le due righe che
   * quella casella apre nel Pit MFD. `null` vuol dire non toccare, come ogni
   * altra voce; e senza la casella accesa non si possono nemmeno mandare,
   * perche' quelle righe nel menu non ci sono.
   */
  brakeFront: number | null
  brakeRear: number | null
  repairBodywork: boolean | null
  repairSuspension: boolean | null
}

/**
 * Cosa risulta impostato adesso sulla macchina del pilota.
 * Stessi campi dell'ordine (una sola forma, niente doppioni) piu' il contesto
 * che decide se l'ordine puo' essere applicato.
 */
export interface PitwallCarState extends PitwallPlan {
  inPitLane: boolean
}

const WHEEL_LABELS: Record<PitwallWheel, string> = {
  FL: 'Anteriore sinistra',
  FR: 'Anteriore destra',
  RL: 'Posteriore sinistra',
  RR: 'Posteriore destra',
}

function clampToRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  if (value < min) return min
  if (value > max) return max
  return value
}

/** Riporta una pressione dentro i limiti e sulla griglia da 0,1 PSI. */
export function clampPressure(value: number): number {
  const bounded = clampToRange(value, PITWALL_PRESSURE_MIN_PSI, PITWALL_PRESSURE_MAX_PSI, PITWALL_PRESSURE_MIN_PSI)
  return Number(bounded.toFixed(1))
}

/** Un click di freccia: +/- 0,1 PSI, senza mai uscire dai limiti. */
export function stepPressure(value: number, direction: 1 | -1): number {
  return clampPressure(clampPressure(value) + direction * PITWALL_PRESSURE_STEP_PSI)
}

/** Riporta il carburante dentro i limiti, in litri interi. */
export function clampFuel(value: number): number {
  return Math.round(clampToRange(value, PITWALL_FUEL_MIN_L, PITWALL_FUEL_MAX_L, PITWALL_FUEL_MIN_L))
}

/** Un click di freccia sul carburante: +/- 1 litro. */
export function stepFuel(value: number, direction: 1 | -1): number {
  return clampFuel(clampFuel(value) + direction * PITWALL_FUEL_STEP_L)
}

/** Riporta il numero del set gomme dentro i limiti, intero. */
export function clampTyreSet(value: number): number {
  return Math.round(clampToRange(value, PITWALL_TYRE_SET_MIN, PITWALL_TYRE_SET_MAX, PITWALL_TYRE_SET_MIN))
}

/** Un click di freccia sul set gomme: +/- 1, senza uscire dai limiti. */
export function stepTyreSet(value: number, direction: 1 | -1): number {
  return clampTyreSet(clampTyreSet(value) + direction)
}

/** Riporta una mescola sconosciuta su "dry", che e' il caso normale. */
export function clampCompound(value: unknown): PitwallCompound {
  return PITWALL_COMPOUNDS.includes(value as PitwallCompound) ? value as PitwallCompound : 'dry'
}

export function wheelLabel(wheel: PitwallWheel): string {
  return WHEEL_LABELS[wheel]
}

export type PitwallAxle = 'front' | 'rear' | 'all'

const AXLE_WHEELS: Record<PitwallAxle, readonly PitwallWheel[]> = {
  front: ['FL', 'FR'],
  rear: ['RL', 'RR'],
  all: PITWALL_WHEELS,
}

export function axleWheels(axle: PitwallAxle): readonly PitwallWheel[] {
  return AXLE_WHEELS[axle]
}

/** Muove insieme le gomme di un asse (o tutte e quattro) di un click. */
export function stepAxle(
  pressures: Record<PitwallWheel, number>,
  axle: PitwallAxle,
  direction: 1 | -1,
): Record<PitwallWheel, number> {
  const next = { ...pressures }
  for (const wheel of axleWheels(axle)) {
    next[wheel] = stepPressure(next[wheel], direction)
  }
  return next
}

/** Scarto rispetto al valore di partenza, gia arrotondato a 0,1 PSI. */
export function pressureDelta(current: number, baseline: number): number {
  return Number((clampPressure(current) - clampPressure(baseline)).toFixed(1))
}

/** Mostra lo scarto con il segno; stringa vuota quando non c'e' scarto. */
export function formatDelta(delta: number): string {
  if (delta === 0) return ''
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${Math.abs(delta).toFixed(1).replace('.', ',')}`
}

export function formatPressure(value: number): string {
  return `${clampPressure(value).toFixed(1).replace('.', ',')} PSI`
}

export function formatFuel(value: number): string {
  return `${clampFuel(value)} L`
}

/** Scarto carburante col segno; stringa vuota quando non c'e' scarto. */
export function formatFuelDelta(delta: number): string {
  if (delta === 0) return ''
  return `${delta > 0 ? '+' : '−'}${Math.abs(Math.round(delta))} L`
}

const COMPOUND_LABELS: Record<PitwallCompound, string> = {
  dry: 'Slick',
  wet: 'Wet',
}

export function formatCompound(value: PitwallCompound): string {
  return COMPOUND_LABELS[clampCompound(value)]
}

export function formatTyreSet(value: number): string {
  return `Set ${clampTyreSet(value)}`
}

export function formatRepairs(bodywork: boolean | null, suspension: boolean | null): string {
  if (bodywork === true && suspension === true) return 'Carrozzeria + sospensioni'
  if (bodywork === true) return 'Solo carrozzeria'
  if (suspension === true) return 'Solo sospensioni'
  // Spegnere e' una richiesta esplicita, e va detta: "nessuna riparazione"
  // significherebbe la stessa cosa di "non toccare", che e' un'altra cosa.
  if (bodywork === false || suspension === false) return 'Riparazioni tolte'
  if (bodywork == null && suspension == null) return 'Non toccare'
  return 'Nessuna riparazione'
}

/** Le tre risposte possibili di una casella del Pit MFD. */
export function formatToggle(value: boolean | null): string {
  if (value == null) return '—'
  return value ? 'Sì' : 'No'
}

export function resolveDriverName(driverId: string | null, drivers: PitwallDriver[]): string {
  if (!driverId) return 'Nessun cambio pilota'
  return drivers.find(driver => driver.id === driverId)?.name || 'Pilota sconosciuto'
}

// ============================================
// Confronto ordine <-> macchina.
// Regola unica: ogni voce mostra il valore che sto per mandare e quello
// attualmente in macchina; l'accento esiste solo dove i due differiscono.
// ============================================

export const PITWALL_FIELDS = [
  'FL', 'FR', 'RL', 'RR', 'compound', 'tyreSet', 'changeTyres', 'fuel', 'driver', 'repairs',
] as const

export type PitwallField = (typeof PITWALL_FIELDS)[number]

/** Una casella di eco: cosa c'e' in macchina e di quanto se ne discosta l'ordine. */
export interface PitwallEchoCell {
  carValue: string
  delta: string
  changed: boolean
}

function isWheelField(field: PitwallField): field is PitwallWheel {
  return (PITWALL_WHEELS as readonly string[]).includes(field)
}

/** Elenca le voci dell'ordine diverse da quelle attualmente in macchina. */
export function pitwallChangedFields(plan: PitwallPlan, car: PitwallPlan): PitwallField[] {
  return PITWALL_FIELDS.filter((field) => {
    if (isWheelField(field)) return pressureDelta(plan.pressures[field], car.pressures[field]) !== 0
    if (field === 'fuel') return clampFuel(plan.fuelLiters) !== clampFuel(car.fuelLiters)
    if (field === 'compound') return clampCompound(plan.compound) !== clampCompound(car.compound)
    if (field === 'tyreSet') return clampTyreSet(plan.tyreSet) !== clampTyreSet(car.tyreSet)
    // `null` vuol dire "non toccare": non e' una differenza dalla macchina.
    if (field === 'changeTyres') return plan.changeTyres != null && plan.changeTyres !== car.changeTyres
    // Nessun pilota scelto significa "non cambiare": non e' una differenza
    // dalla macchina, e non deve accendere un chip ne' togliere l'Allineato.
    if (field === 'driver') return plan.driverId != null && plan.driverId !== car.driverId
    return (plan.repairBodywork != null && plan.repairBodywork !== car.repairBodywork)
      || (plan.repairSuspension != null && plan.repairSuspension !== car.repairSuspension)
  })
}

/** Vero quando l'ordine coincide in tutto con quello che ha la macchina. */
export function pitwallPlanMatches(plan: PitwallPlan, car: PitwallPlan): boolean {
  return pitwallChangedFields(plan, car).length === 0
}

const FIELD_LABELS: Record<PitwallField, string> = {
  FL: 'FL',
  FR: 'FR',
  RL: 'RL',
  RR: 'RR',
  compound: 'Mescola',
  tyreSet: 'Set',
  changeTyres: 'Cambio gomme',
  fuel: 'Fuel',
  driver: 'Pilota',
  repairs: 'Riparazioni',
}

export function pitwallFieldLabel(field: PitwallField): string {
  return FIELD_LABELS[field]
}

/** Il valore di una voce, formattato: vale sia per l'ordine sia per la macchina. */
export function pitwallFieldValue(plan: PitwallPlan, field: PitwallField, drivers: PitwallDriver[]): string {
  if (isWheelField(field)) return formatPressure(plan.pressures[field])
  if (field === 'fuel') return formatFuel(plan.fuelLiters)
  if (field === 'compound') return formatCompound(plan.compound)
  if (field === 'tyreSet') return formatTyreSet(plan.tyreSet)
  if (field === 'changeTyres') return plan.changeTyres == null ? '—' : (plan.changeTyres ? 'Sì' : 'No')
  if (field === 'driver') return resolveDriverName(plan.driverId, drivers)
  return formatRepairs(plan.repairBodywork, plan.repairSuspension)
}

/** Lo scarto numerico, dove ha senso mostrarlo (pressioni e carburante). */
function fieldDelta(plan: PitwallPlan, car: PitwallPlan, field: PitwallField): string {
  if (isWheelField(field)) return formatDelta(pressureDelta(plan.pressures[field], car.pressures[field]))
  if (field === 'fuel') return formatFuelDelta(clampFuel(plan.fuelLiters) - clampFuel(car.fuelLiters))
  return ''
}

/** L'eco di ogni voce: una sola fonte per le schede e per la barra ordine. */
export function buildPitwallEcho(
  plan: PitwallPlan,
  car: PitwallPlan,
  drivers: PitwallDriver[],
): Record<PitwallField, PitwallEchoCell> {
  const changed = new Set(pitwallChangedFields(plan, car))

  return Object.fromEntries(PITWALL_FIELDS.map(field => [field, {
    carValue: pitwallFieldValue(car, field, drivers),
    delta: fieldDelta(plan, car, field),
    changed: changed.has(field),
  }])) as Record<PitwallField, PitwallEchoCell>
}

/** Le sole voci che cambiano: e' questo il riassunto utile in cima. */
export function buildPitwallChangeChips(
  plan: PitwallPlan,
  car: PitwallPlan,
  drivers: PitwallDriver[],
): { field: PitwallField, label: string, value: string, delta: string }[] {
  return pitwallChangedFields(plan, car).map(field => ({
    field,
    label: pitwallFieldLabel(field),
    value: pitwallFieldValue(plan, field, drivers),
    delta: fieldDelta(plan, car, field),
  }))
}

// ============================================
// Durata stimata della sosta.
// ============================================

/**
 * Costanti di durata. Sono SEGNAPOSTO: vanno calibrate su dati ACC reali
 * prima di presentare questo tempo al pilota come attendibile.
 */
export const PITWALL_STOP_TIMING = {
  /** Tempo fisso della sosta a prescindere dal servizio (fermata, jack). */
  baseSeconds: 2,
  refuelLitresPerSecond: 2.7,
  tyreChangeSeconds: 26,
  driverSwapSeconds: 30,
  bodyworkSeconds: 15,
  suspensionSeconds: 30,
} as const

export interface PitwallStopPart {
  label: string
  seconds: number
}

export interface PitwallStopEstimate {
  seconds: number
  parts: PitwallStopPart[]
}

/**
 * Durata stimata: base + max(rifornimento, gomme, cambio pilota) + riparazioni.
 * Il servizio avviene in parallelo, quindi comanda l'operazione piu' lunga;
 * le riparazioni invece si sommano.
 */
export function estimatePitStop(plan: PitwallPlan, car: PitwallPlan): PitwallStopEstimate {
  const parts: PitwallStopPart[] = []

  const litresToAdd = Math.max(0, clampFuel(plan.fuelLiters) - clampFuel(car.fuelLiters))
  const refuel = litresToAdd / PITWALL_STOP_TIMING.refuelLitresPerSecond
  if (refuel > 0) parts.push({ label: `Rifornimento ${Math.round(litresToAdd)} L`, seconds: refuel })

  const tyresChanged = plan.changeTyres === true
    || clampCompound(plan.compound) !== clampCompound(car.compound)
    || clampTyreSet(plan.tyreSet) !== clampTyreSet(car.tyreSet)
  const tyres = tyresChanged ? PITWALL_STOP_TIMING.tyreChangeSeconds : 0
  if (tyres > 0) parts.push({ label: 'Cambio gomme', seconds: tyres })

  const driverChanged = Boolean(plan.driverId) && plan.driverId !== car.driverId
  const driverSwap = driverChanged ? PITWALL_STOP_TIMING.driverSwapSeconds : 0
  if (driverSwap > 0) parts.push({ label: 'Cambio pilota', seconds: driverSwap })

  // Servizio in parallelo: conta solo l'operazione piu' lunga.
  const service = Math.max(refuel, tyres, driverSwap)

  let repairs = 0
  if (plan.repairBodywork === true) {
    repairs += PITWALL_STOP_TIMING.bodyworkSeconds
    parts.push({ label: 'Carrozzeria', seconds: PITWALL_STOP_TIMING.bodyworkSeconds })
  }
  if (plan.repairSuspension === true) {
    repairs += PITWALL_STOP_TIMING.suspensionSeconds
    parts.push({ label: 'Sospensioni', seconds: PITWALL_STOP_TIMING.suspensionSeconds })
  }

  const total = service + repairs > 0 ? PITWALL_STOP_TIMING.baseSeconds + service + repairs : 0
  return { seconds: Number(total.toFixed(1)), parts }
}

/** Durata leggibile a colpo d'occhio: secondi sotto il minuto, poi m:ss. */
export function formatStopDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const rounded = Number(seconds.toFixed(1))
  if (rounded < 60) return `${rounded.toFixed(1).replace('.', ',')} s`
  const minutes = Math.floor(rounded / 60)
  const rest = Math.round(rounded - minutes * 60)
  return rest === 60
    ? `${minutes + 1}:00 min`
    : `${minutes}:${String(rest).padStart(2, '0')} min`
}

export type PitwallOrderState = 'in-sync' | 'draft' | 'pending' | 'failed'

export interface PitwallOrderStatus {
  state: PitwallOrderState
  label: string
  detail: string
  changedCount: number
}

/**
 * Stato dell'ordine in una riga sola:
 * allineato, bozza da mandare, inviato in attesa dei box, oppure fallito.
 */
export function resolvePitwallOrderStatus(input: {
  plan: PitwallPlan
  car: PitwallCarState
  sentPlan: PitwallPlan | null
  failureReason?: string | null
}): PitwallOrderStatus {
  const { plan, car, sentPlan, failureReason } = input
  const changedCount = pitwallChangedFields(plan, car).length

  if (failureReason) {
    return { state: 'failed', label: 'Non applicato', detail: failureReason, changedCount }
  }

  if (sentPlan && !pitwallPlanMatches(sentPlan, car)) {
    return {
      state: 'pending',
      label: 'Inviato',
      detail: car.inPitLane
        ? 'Auto ai box: applicazione in corso.'
        : 'In attesa che l’auto sia ferma ai box.',
      changedCount,
    }
  }

  // Allineato e bozza non hanno dettaglio: la parola di stato basta, e cosa
  // stia cambiando lo dicono gia' i chip della barra. Il dettaglio esiste solo
  // dove aggiunge il *perche'* (in attesa dei box, oppure fallito).
  if (changedCount === 0) {
    return { state: 'in-sync', label: 'Allineato', detail: '', changedCount }
  }

  return { state: 'draft', label: 'Bozza', detail: '', changedCount }
}
