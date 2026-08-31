import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const panel = read('app/components/pages/PitwallPage.vue')
const valueField = read('app/components/pitwall/PitwallValueField.vue')
const orderBar = read('app/components/pitwall/PitwallOrderBar.vue')
const carCard = read('app/components/pitwall/PitwallCarCard.vue')
const carSvg = read('public/images/pitwall-car-top.svg')
const page = read('app/pages/pitwall.vue')
const tabsBar = read('app/components/layout/TabsBarRouter.vue')
const dashboardLayout = read('app/layouts/dashboard.vue')

describe('Pitwall layout approvato', () => {
  it('usa la fascia connessioni a tre sezioni senza accordion', () => {
    expect(panel).toContain('PILOTA ASSISTITO')
    expect(panel).toContain('CERCA PILOTA')
    expect(panel).toContain('PILOTI RECENTI')
    expect(panel).toContain('grid-template-columns: .92fr .94fr 1.34fr')
    expect(panel).not.toContain('showLinkPanel')
    expect(panel).not.toContain('pilot-bar__toggle')
    expect(panel).not.toContain('Nessun pilota collegato — scegli chi assistere qui sotto')
  })

  it('mette i permessi permanenti prima dello storico', () => {
    expect(panel).toContain("a.status === 'ready' && a.scope === 'always'")
    expect(panel).toContain('recentPilots')
    expect(panel).toContain('Richiedi accesso')
    expect(panel).toContain('valido fino alle')
    expect(panel).toContain('accesso permanente')
  })

  it('mantiene ricerca, richieste e revoca dei permessi reali', () => {
    expect(panel).toContain('@input="onSearchInput"')
    expect(panel).toContain("askLink(found.uid, 'once')")
    expect(panel).toContain("askLink(found.uid, 'always')")
    expect(panel).toContain('link.preAuthorise(found.uid)')
    expect(panel).toContain("link.decide(request.engineerUid, 'revoked')")
  })

  it('separa strategia da inviare e MFD in macchina in due colonne', () => {
    expect(panel).toContain('STRATEGIA DA INVIARE')
    expect(carCard).toContain('MFD IN MACCHINA')
    expect(panel).toContain('grid-template-columns: minmax(650px,1.16fr) minmax(420px,.84fr)')
    expect(carCard).toContain('background: #0b1a2a')
  })

  it('usa le etichette finali approvate', () => {
    expect(panel).toContain('Carburante in uscita')
    expect(panel).toContain('Pressioni pneumatici (PSI)')
    expect(panel).toContain('Set pneumatici')
    expect(panel).toContain('Cambio gomme')
    expect(panel).toContain('Prossimo pilota')
    expect(panel).toContain('Sostituisci freni')
    expect(panel).not.toContain('Riallinea')
  })

  it('non mostra icone decorative davanti ai due titoli principali', () => {
    expect(panel).toContain('<h2 id="strategy-title" class="panel-title">STRATEGIA DA INVIARE</h2>')
    expect(carCard).toContain('<h2 id="pitwall-mfd-title">MFD IN MACCHINA</h2>')
  })

  it('collassa in modo leggibile sui viewport stretti', () => {
    expect(panel).toContain('@media (max-width: 1180px)')
    expect(panel).toContain('@media (max-width: 1120px) { .workspace { grid-template-columns: 1fr; } }')
    expect(panel).toContain('@media (max-width: 760px)')
    expect(carCard).toContain('@media (max-width: 760px)')
  })

  it('mantiene strategia e MFD affiancati sui laptop larghi', () => {
    expect(panel).toContain('grid-template-columns: minmax(650px,1.16fr) minmax(420px,.84fr)')
    expect(panel).not.toContain('@media (max-width: 1180px) { .connections { grid-template-columns: 1fr 1fr; }.connection-cell--recent { grid-column: 1 / -1; }.workspace')
  })
})

describe('Pitwall pressioni e sagoma vettura', () => {
  it('usa un asset SVG esterno riusabile, non CSS art', () => {
    expect(panel).toContain('src="/images/pitwall-car-top.svg"')
    expect(carSvg).toContain('<svg')
    expect(carSvg).toContain('viewBox="0 0 120 240"')
    expect(carSvg).toContain('Sagoma vettura vista dall\'alto')
    expect(carSvg).toContain('id="front"')
    expect(carSvg).toContain('id="rear"')
  })

  it('dispone FL FR RL RR attorno alla sagoma', () => {
    expect(panel).toContain('v-for="wheel in PITWALL_WHEELS"')
    for (const wheel of ['fl', 'fr', 'rl', 'rr']) expect(panel).toContain(`.tyre-control--${wheel}`)
    expect(panel).toContain('.car-silhouette')
  })

  it('separa pressioni e impostazioni gomme con una linea verticale', () => {
    expect(panel).toContain('border-right: 1px solid rgba(255,255,255,.13)')
    expect(panel).toContain('class="tyre-settings"')
  })

  it('mantiene stepper a larghezza fissa quando i valori cambiano', () => {
    expect(panel).toContain('width: 70px; min-width: 70px; max-width: 70px')
    expect(valueField).toContain('font-variant-numeric')
    expect(valueField).toContain("replace('.', ',')")
    expect(valueField).toContain('inputmode="decimal"')
  })

  it('conserva limiti, incremento e accessibilità dei controlli', () => {
    expect(panel).toContain('stepPressure(pressures.value[wheel], direction)')
    expect(panel).toContain('clampPressure(value)')
    expect(valueField).toContain(':aria-valuemin="min"')
    expect(valueField).toContain(':aria-valuemax="max"')
    expect(valueField).toContain(':aria-valuenow="value"')
  })
})

describe('Pitwall ordine reale e MFD onesto', () => {
  it('invia davvero solo i campi conosciuti dal runtime', () => {
    expect(panel).toContain('await link.sendPlan(planPayload())')
    expect(panel).toContain('if (!link.selectedDriverUid.value) return')
    for (const field of ['fuelLiters', 'tyreSet', 'pressures', 'compound', 'changeTyres', 'repairBodywork', 'repairSuspension', 'driverId']) {
      expect(panel).toContain(`payload.${field}`)
    }
  })

  it('espone Cambio gomme nella singola fonte PitwallPlan', () => {
    expect(panel).toContain('const changeTyres = ref(false)')
    expect(panel).toContain('changeTyres: changeTyres.value')
    expect(panel).toContain('v-model="changeTyres"')
  })

  it('usa dati macchina e equipaggio dalla presenza reale', () => {
    expect(panel).toContain('link.selectedPilot.value?.session')
    expect(panel).toContain('session.value?.strategy')
    expect(panel).toContain('session.value?.crew')
    expect(panel).not.toContain('MOCK_CAR')
    expect(carCard).not.toContain('Dati finti')
  })

  it('distingue LIVE, dati vecchi, ultimo ordine e non disponibile', () => {
    expect(carCard).toContain("type MfdSource = 'live' | 'stale' | 'order' | 'unavailable'")
    expect(carCard).toContain("live: 'LIVE'")
    expect(carCard).toContain("stale: 'DATI VECCHI'")
    expect(carCard).toContain("order: 'ULTIMO ORDINE'")
    expect(carCard).toContain("unavailable: 'N/D'")
  })

  it('riporta tutte le voci MFD richieste', () => {
    for (const label of ['Preset strategia', 'Carburante in uscita', 'Cambio gomme', 'Set pneumatici', 'Mescola', 'Pressione FL', 'Pressione FR', 'Pressione RL', 'Pressione RR', 'Sostituisci freni', 'Pilota selezionato', 'Sospensioni', 'Carrozzeria', 'Tempo stop stimato']) {
      expect(carCard).toContain(label)
    }
  })

  it('mantiene l esito dell ordine distinto campo per campo', () => {
    expect(panel).toContain('fieldOutcomes')
    expect(panel).toContain("item.outcome === 'verified'")
    expect(panel).toContain("item.outcome === 'selected'")
    expect(panel).toContain('item.reason')
  })

  it('mostra tempo stimato e azione primaria nel footer', () => {
    expect(orderBar).toContain('Tempo stop stimato')
    expect(orderBar).toContain('INVIA ALLA MACCHINA')
    expect(orderBar).toContain(':disabled="!canSend"')
    expect(panel).toContain('estimatePitStop(plan.value, car.value)')
  })

  it('non parla direttamente con Electron dal browser', () => {
    expect(panel).not.toMatch(/window\.electron|ipcRenderer|\$fetch|useFetch/)
    expect(carCard).not.toMatch(/window\.electron|ipcRenderer|\$fetch|useFetch/)
  })
})

describe('Pitwall wiring', () => {
  it('monta la pagina nel layout dashboard e nella navbar', () => {
    expect(page).toContain("import PitwallPage from '~/components/pages/PitwallPage.vue'")
    expect(page).toContain("layout: 'dashboard'")
    expect(tabsBar).toContain("{ id: 'pitwall', label: 'PITWALL', to: '/pitwall' }")
    expect(dashboardLayout).toContain("if (path.startsWith('/pitwall')) return 'pitwall'")
  })

  it('mantiene logo, navigazione e profilo sulla stessa riga nel Pitwall desktop', () => {
    expect(dashboardLayout).toContain("route.path.startsWith('/pitwall')")
    expect(dashboardLayout).toContain('dashboard-sticky-header--single-row')
    expect(dashboardLayout).toContain(':deep(.topbar)')
    expect(dashboardLayout).toContain(':deep(.tabsbar)')
  })

  it('riusa i mattoncini Pitwall senza duplicare la logica pura', () => {
    expect(panel).toContain("import PitwallCarCard from '~/components/pitwall/PitwallCarCard.vue'")
    expect(panel).toContain("import PitwallOrderBar from '~/components/pitwall/PitwallOrderBar.vue'")
    expect(panel).toContain("import PitwallValueField from '~/components/pitwall/PitwallValueField.vue'")
    expect(panel).toContain("from '~/utils/pitwallPresentation'")
  })
})
