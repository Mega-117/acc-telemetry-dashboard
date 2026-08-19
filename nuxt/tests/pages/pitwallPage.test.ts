import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')

const panel = read('app/components/pages/PitwallPage.vue')
const valueField = read('app/components/pitwall/PitwallValueField.vue')
const chipGroup = read('app/components/pitwall/PitwallChipGroup.vue')
const orderBar = read('app/components/pitwall/PitwallOrderBar.vue')
const carCard = read('app/components/pitwall/PitwallCarCard.vue')
const syncStrip = read('app/components/pitwall/PitwallSyncStrip.vue')
const page = read('app/pages/pitwall.vue')
const tabsBar = read('app/components/layout/TabsBarRouter.vue')
const dashboardLayout = read('app/layouts/dashboard.vue')

describe('Pitwall UI contract', () => {
  it('espone i gruppi di controllo dell ingegnere di pista', () => {
    expect(panel).toContain('<h2>Pressioni</h2>')
    expect(panel).toContain('<h2>In uscita dai box</h2>')
    expect(panel).toContain('<h2>Cambio pilota</h2>')
    expect(panel).toContain('<h2>Riparazioni</h2>')
    expect(carCard).toContain('<h2>Macchina</h2>')
  })

  it('non ripete la stessa etichetta due volte per lo stesso valore', () => {
    // "Carburante" era la terza etichetta dopo "In uscita dai box" e il numero;
    // "Gomme" la seconda dopo Slick/Wet e Set.
    expect(panel).not.toContain('<h2>Carburante</h2>')
    expect(panel).not.toContain('<h2>Gomme</h2>')
    // Il titolo di pagina duplicava la tab attiva: resta solo per screen reader.
    expect(orderBar).toMatch(/<h1 class="sr-only">\s*Pitwall\s*<\/h1>/)
    expect(orderBar).not.toContain('Ingegnere di pista')
  })

  it('mette al centro l ordine completo: mescola e set stanno con le pressioni', () => {
    expect(panel).toContain('PITWALL_COMPOUNDS.map(value => ({ value, label: formatCompound(value) }))')
    expect(panel).toContain('stepTyreSet(tyreSet, $event)')
    expect(panel).toContain('clampTyreSet($event)')
  })

  it('dice in una riga sola se l ordine e allineato alla macchina', () => {
    expect(orderBar).toContain('<PitwallSyncStrip :status="status" />')
    expect(panel).toContain('resolvePitwallOrderStatus({')
    expect(syncStrip).toContain('.sync--in-sync')
    expect(syncStrip).toContain('.sync--draft')
    expect(syncStrip).toContain('.sync--pending')
    expect(syncStrip).toContain('.sync--failed')
  })

  it('la barra in alto riassume solo cio che sto cambiando', () => {
    expect(panel).toContain('buildPitwallChangeChips(plan.value, car.value, drivers)')
    expect(orderBar).toContain('v-for="chip in chips"')
    expect(orderBar).toContain(':disabled="!canSend"')
    expect(panel).toContain(':can-send="hasChanges"')
  })

  it('dice quanto resta fermo il pilota', () => {
    expect(panel).toContain('estimatePitStop(plan.value, car.value)')
    expect(panel).toContain(':stop="stopEstimate"')
    expect(orderBar).toContain('formatStopDuration(props.stop.seconds)')
    expect(orderBar).toContain('<span>Sosta</span>')
    // Solo quando c'e' davvero un servizio da fare.
    expect(orderBar).toContain('v-if="stop.seconds > 0"')
  })

  it('non dice tre volte la stessa cosa quando non c e nulla da inviare', () => {
    // Prima: "ALLINEATO" + "L'ordine coincide con la macchina." + "Nessuna
    // modifica da inviare", tutti insieme nella stessa riga.
    expect(orderBar).not.toContain('Nessuna modifica da inviare')
    expect(syncStrip).toContain('v-if="status.detail"')
  })
})

describe('Pitwall eco della macchina', () => {
  it('ogni voce mostra accanto al valore da inviare quello gia in macchina', () => {
    expect(panel).toContain('buildPitwallEcho(plan.value, car.value, drivers)')
    expect(panel).toContain(':echo="echo[wheel]"')
    expect(panel).toContain(':echo="echo.fuel"')
    expect(panel).toContain(':echo="echo.tyreSet"')
    expect(valueField).toContain('in auto {{ echo.carValue }}')
    // Per le schede a chip l'eco sta nell'intestazione: una riga in meno,
    // che e' cio' che tiene la pagina dentro un viewport.
    expect(panel).toContain('in auto {{ echo.compound.carValue }}')
    expect(panel).toContain('in auto {{ echo.driver.carValue }}')
    expect(panel).toContain('in auto {{ echo.repairs.carValue }}')
    expect(chipGroup).not.toContain('echo')
  })

  it('mostra l eco solo dove differisce, non quando ripete la cifra sopra', () => {
    // Allineato e' lo stato normale: li' l'eco sarebbe nove righe che
    // ripetono il numero gia' visibile nel campo.
    expect(valueField).toContain('v-if="echo.changed"')
    expect(panel).toContain('v-if="echo.compound.changed"')
    expect(panel).toContain('v-if="echo.driver.changed"')
    expect(panel).toContain('v-if="echo.repairs.changed"')
  })

  it('lo scarto e calcolato sulla macchina, non su una partenza fissa', () => {
    // La vecchia costante `baseline` hardcoded non deve tornare: il riferimento
    // dello scarto e' sempre lo stato della macchina.
    expect(panel).not.toContain('const baseline')
    expect(panel).not.toContain('baseline[wheel]')
    expect(panel).toContain('Riporta l’ordine ai valori attualmente in macchina')
    expect(panel).toContain('function resetToCar()')
  })

  it('riserva l accento alle sole voci diverse dalla macchina', () => {
    expect(valueField).toContain('.field--changed')
    expect(valueField).toContain('border-color: rgba(var(--accent-rgb), 0.55)')
    expect(panel).toContain('.echo-line--changed')
    // Hover e stati attivi restano neutri: il colore significa solo "diverso".
    expect(chipGroup).not.toMatch(/\.chip--active \{\s*\n\s*border-color: rgba\(var\(--accent-rgb\)/)
    expect(valueField).not.toMatch(/button:focus-visible:not\(:disabled\) \{\s*\n\s*border-color: rgba\(var\(--accent-rgb\)/)
  })
})

describe('Pitwall layout', () => {
  it('dispone due colonne: largo cio che cambia a ogni sosta', () => {
    // La colonna di destra e' capped: prende quanto le serve, non meta' pagina.
    expect(panel).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 440px)')
    expect(panel).toContain('class="col col--order"')
    expect(panel).toContain('class="col col--side"')
  })

  it('tiene le quattro gomme disposte come si vede l auto dall alto', () => {
    expect(panel).toContain('v-for="wheel in PITWALL_WHEELS"')
    expect(panel).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
  })

  it('nasconde le frecce native dei campi numerici', () => {
    // Comparivano al passaggio del mouse, spostavano il numero e offrivano
    // un secondo modo minuscolo di fare quello che fanno i due bersagli grandi.
    expect(valueField).toContain('appearance: textfield')
    expect(valueField).toContain('::-webkit-inner-spin-button')
    expect(valueField).toContain('::-webkit-outer-spin-button')
  })

  it('usa bersagli grandi: si clicca di fretta', () => {
    expect(valueField).toContain('min-height: 40px')
    expect(chipGroup).toContain('min-height: 34px')
    expect(panel).toContain('min-height: 34px')
  })

  it('collassa a una colonna sugli schermi stretti', () => {
    expect(panel).toContain('@media (max-width: 1000px)')
  })

  it('sta in un viewport senza scroll: contenitore compatto, non quello di lettura', () => {
    // Verificato a 1920x1080 e 1366x768 con Playwright sul dev server.
    expect(panel).toContain('.pitwall-page')
    expect(panel).not.toContain('<LayoutPageContainer>')
    expect(panel).toContain('class="rubber"')
  })

  it('i controlli non si stirano per riempire la colonna', () => {
    // Il difetto originale: `1fr` al centro dello stepper dava 238px al campo
    // che contiene "24,4" e 658px a quello che contiene "42".
    expect(valueField).toContain('max-width: 132px')
    expect(valueField).not.toContain('grid-template-columns: 40px minmax(0, 1fr) 40px')
    expect(panel).toContain('max-width: 980px')
  })

  it('offre un solo modo per ogni valore: niente controlli doppioni', () => {
    // Stepper + preset bastano: lo slider carburante era un terzo controllo
    // per lo stesso numero, e costava solo altezza.
    expect(panel).not.toContain('type="range"')
    expect(panel).toContain('v-for="preset in FUEL_PRESETS"')
  })
})

describe('Pitwall resta front-end', () => {
  it('non legge telemetria e non invia nulla alla macchina', () => {
    expect(panel).toContain('const MOCK_CAR: PitwallCarState')
    expect(panel).toContain('sentPlan.value = { ...plan.value')
    expect(carCard).toContain('Dati finti: nessuna telemetria letta, niente inviato alla macchina.')
    expect(panel).not.toMatch(/window\.electron|useFetch|\$fetch|ipcRenderer/)
    expect(carCard).not.toMatch(/window\.electron|useFetch|\$fetch|ipcRenderer/)
  })

  it('marca i comandi finti come tali', () => {
    expect(panel).toContain('function mockTogglePitLane()')
    expect(panel).toContain('function mockApplyOrder()')
    expect(carCard).toContain('>MOCK</span>')
  })

  it('tiene il simulatore fuori dalla build utente (Principio 4)', () => {
    expect(carCard).toContain('const showMockControls = import.meta.dev')
    expect(carCard).toContain('v-if="showMockControls"')
  })

  it('non mostra dati che non sono informazione', () => {
    // "Ultimo ordine: N voci inviate" era sempre lo stesso numero di campi.
    expect(carCard).not.toContain('voci inviate')
    expect(panel).not.toContain('sentSummary')
  })

  it('riusa la logica pura invece di duplicarla nel template', () => {
    expect(panel).toContain("from '~/utils/pitwallPresentation'")
    expect(panel).not.toMatch(/toFixed\(1\)\.replace/)
    expect(valueField).toContain("import type { PitwallEchoCell } from '~/utils/pitwallPresentation'")
  })
})

describe('Pitwall wiring', () => {
  it('monta il pannello nel layout dashboard', () => {
    expect(page).toContain("import PitwallPage from '~/components/pages/PitwallPage.vue'")
    expect(page).toContain("layout: 'dashboard'")
    expect(page).toMatch(/<div class="pitwall-route">\s*<PitwallPage\s*\/>\s*<\/div>/)
  })

  it('importa esplicitamente i mattoncini della pitwall', () => {
    expect(panel).toContain("import PitwallCarCard from '~/components/pitwall/PitwallCarCard.vue'")
    expect(panel).toContain("import PitwallChipGroup from '~/components/pitwall/PitwallChipGroup.vue'")
    expect(panel).toContain("import PitwallOrderBar from '~/components/pitwall/PitwallOrderBar.vue'")
    expect(panel).toContain("import PitwallValueField from '~/components/pitwall/PitwallValueField.vue'")
    expect(orderBar).toContain("import PitwallSyncStrip from '~/components/pitwall/PitwallSyncStrip.vue'")
  })

  it('espone la voce PITWALL nella navbar principale', () => {
    expect(tabsBar).toContain("{ id: 'pitwall', label: 'PITWALL', to: '/pitwall' }")
    expect(tabsBar).toContain("'pitwall'")
  })

  it('evidenzia la tab quando la rotta e attiva', () => {
    expect(dashboardLayout).toContain("if (path.startsWith('/pitwall')) return 'pitwall'")
  })
})
