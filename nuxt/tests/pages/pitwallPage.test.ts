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
const concept = read('app/components/pitwall/concept/PitwallConcept.vue')
const conceptBell = read('app/components/pitwall/concept/PitwallConceptBell.vue')
const topBar = read('app/components/layout/TopBar.vue')

describe('Pitwall layout approvato', () => {
  it('usa la fascia gara a tre sezioni senza accordion', () => {
    // La fascia non parla piu' di una persona da assistere: parla della gara,
    // di chi si aggiunge e di chi c'e' dentro. E' la differenza che regge
    // l'endurance, e deve restare visibile in un colpo d'occhio.
    expect(panel).toContain('GARA IN CORSO')
    expect(panel).toContain('AGGIUNGI ALLA GARA')
    expect(panel).toContain('EQUIPAGGIO')
    expect(panel).toContain('grid-template-columns: .92fr .94fr 1.34fr')
    expect(panel).not.toContain('showLinkPanel')
    expect(panel).not.toContain('pilot-bar__toggle')
    expect(panel).not.toContain('PILOTA ASSISTITO')
  })

  it('mostra chi guida adesso, chi e presente e chi e solo invitato', () => {
    expect(panel).toContain('link.crew.value')
    expect(panel).toContain('AL VOLANTE')
    expect(panel).toContain('invitato · non ancora entrato')
    expect(panel).toContain('gestisce la gara')
    expect(panel).toContain('is-driving')
  })

  it('dichiara il conflitto invece di scegliere un pilota a caso', () => {
    // Con due al volante non si indovina: la pagina lo dice e nessun ordine
    // parte. Mandare una strategia alla macchina sbagliata e' peggio che non
    // mandarla.
    expect(panel).toContain("link.executor.value.reason === 'multiple-driving'")
    expect(panel).toContain('nessun ordine parte finché non è chiaro chi guida')
  })

  it('mantiene ricerca, invito alla gara e permessi fra account', () => {
    expect(panel).toContain('@input="onSearchInput"')
    expect(panel).toContain('link.invite(found.uid)')
    expect(panel).toContain('trust.preAuthorise(found.uid)')
    expect(panel).toContain("trust.decide(request.engineerUid, 'revoked')")
    // Invitare e' un potere del manager, e la pagina non finge il contrario.
    expect(panel).toContain('v-if="link.isManager.value && link.room.value"')
  })

  it('permette di uscire e di chiudere la gara senza buttarla giu agli altri', () => {
    expect(panel).toContain('link.leave()')
    expect(panel).toContain('link.closeRoom()')
    expect(panel).toContain('link.promote(person.uid)')
    expect(panel).toContain('link.revoke(person.uid)')
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
    expect(panel).toContain('src="/images/pitwall-car-top.svg?v=6"')
    expect(carSvg).toContain('<svg')
    expect(carSvg).toContain('viewBox="0 0 133 246"')
    expect(carSvg).toContain('Sagoma vettura vista dall\'alto')
    expect(carSvg).toContain('id="body"')
    expect(carSvg).toContain('id="trace-1"')
    expect(carSvg).toContain('#trace-1 { fill: #121c24; }')
    expect(carSvg).toContain('#trace-13 { fill: #a9afb2; }')
    expect(carSvg).not.toContain('<image')
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
    expect(valueField).toContain('align-items: center')
    expect(valueField).toContain('border: 0')
    expect(valueField).toContain('class="stepper__unit"')
    expect(valueField).toContain('line-height: 1.25')
    expect(valueField).toContain("replace('.', ',')")
    expect(valueField).toContain('inputmode="decimal"')
  })

  it('mantiene il setup pneumatici leggibile e la mappa proporzionata al mockup', () => {
    expect(panel).toContain('grid-template-columns: minmax(0,1fr) 155px')
    expect(panel).toContain('width: 132px; height: 244px')
    expect(panel).toContain('width: 140px')
    expect(panel).toContain('.tyre-settings :deep(.field--bare) { display: grid')
    expect(panel).toContain('.tyre-settings :deep(.field__head) { white-space: nowrap; }')
  })

  it('separa i controlli dalla vettura e mostra tutti i piloti sui telefoni', () => {
    expect(panel).toContain('@media (min-width: 1121px) and (max-width: 1280px)')
    expect(panel).toContain('@media (max-width: 480px)')
    expect(panel).toContain('.pressure-map { min-height: 348px; }')
    expect(panel).toContain('.car-silhouette { top: 79px; width: 101px; height: 187px; }')
    expect(panel).toContain('grid-template-columns: 44px 52px 44px')
    expect(panel).toContain('.recent-list { max-height: none; overflow-y: visible; }')
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
    for (const field of ['fuelLiters', 'tyreSet', 'pressures', 'compound', 'changeTyres', 'repairBodywork', 'repairSuspension', 'driverId']) {
      expect(panel).toContain(`payload.${field}`)
    }
  })

  it('espone Cambio gomme nella singola fonte PitwallPlan', () => {
    expect(panel).toContain('const changeTyres = ref(false)')
    expect(panel).toContain('changeTyres: changeTyres.value')
    expect(panel).toContain('v-model="changeTyres"')
  })

  it('usa dati macchina e equipaggio da chi e al volante, non da un pilota scelto', () => {
    // La fotografia della vettura la vede solo chi guida: prenderla da un
    // "pilota assistito" fisso significherebbe mostrare dati di un PC spento.
    expect(panel).toContain('link.carSnapshot.value')
    expect(panel).toContain('session.value?.strategy')
    expect(panel).toContain('session.value?.crew')
    expect(panel).not.toContain('MOCK_CAR')
    expect(carCard).not.toContain('Dati finti')
  })

  it('spegne l invio quando l ordine non potrebbe partire, e dice perche', () => {
    expect(panel).toContain(':can-send="sendEnabled"')
    expect(panel).toContain(':blocked-reason="blockedReason"')
    expect(panel).toContain('hasChanges.value && link.canSend.value')
    expect(orderBar).toContain('orderbar__blocked')
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

  it('usa anche nel Pitwall lo stesso header a due righe delle altre pagine dashboard', () => {
    expect(dashboardLayout).toContain('<div class="dashboard-sticky-header">')
    expect(dashboardLayout).not.toContain('dashboard-sticky-header--single-row')
    expect(dashboardLayout).not.toContain("route.path.startsWith('/pitwall')")
  })

  it('riusa i mattoncini Pitwall senza duplicare la logica pura', () => {
    expect(panel).toContain("import PitwallCarCard from '~/components/pitwall/PitwallCarCard.vue'")
    expect(panel).toContain("import PitwallOrderBar from '~/components/pitwall/PitwallOrderBar.vue'")
    expect(panel).toContain("import PitwallValueField from '~/components/pitwall/PitwallValueField.vue'")
    expect(panel).toContain("from '~/utils/pitwallPresentation'")
  })

  it('mantiene la vista classica come default e isola il Concept', () => {
    expect(page).toContain('PitwallPage v-if="!conceptActive"')
    expect(page).toContain('<PitwallConcept v-else')
    expect(page).toContain('Classica')
    expect(page).toContain('Concept')
    expect(page).toContain('onBeforeUnmount(() => setActive(false))')
    expect(concept).not.toMatch(/useFirebase|usePitwallRoom|usePitwallLink|window\.electron|ipcRenderer|\$fetch|useFetch/)
  })

  it('rende navigabile l intero flusso mock approvato', () => {
    for (const screen of ['home', 'crew-create-identity', 'crew-create-people', 'crew-detail', 'live']) {
      expect(concept).toContain(screen)
    }
    expect(concept).toContain("liveTab = 'timing'")
    expect(concept).toContain("liveTab = 'track'")
    expect(concept).toContain('Invita un ospite al muretto')
    expect(concept).toContain('Invia strategia')
  })

  it('mantiene i due step Crea Crew compatti e senza azioni duplicate', () => {
    expect(concept).toContain('class="pwc-flow-header"')
    expect(concept).toContain('aria-label="Avanzamento creazione Crew"')
    expect(concept).toContain('class="pwc-flow-card pwc-flow-card--identity"')
    expect(concept).toContain('class="pwc-identity-grid"')
    expect(concept).toContain('class="pwc-flow-card pwc-flow-card--people"')
    expect(concept).toContain('class="pwc-invite-summary"')
    expect(concept).toContain('filterPitwallConceptPeopleByNickname')
    expect(concept).toContain('placeholder="Cerca nickname"')
    expect(concept).toContain('pitwallConceptNickname(person)')
    expect(concept).toContain('Nessun nickname trovato.')
    expect(concept).toContain('class="pwc-field-label">Nome Crew <em>*</em>')
    expect(concept).toContain('.pwc-image-picker legend { margin-bottom: 7px; }')
    expect(concept).toContain('.pwc-invite-row:last-of-type { border-bottom: 0; }')
    expect(concept).toContain('inset: 0 auto 12px 0;')
    expect(concept).toContain('.pwc-invite-summary::before { display: none; }')
    expect(concept).toContain('grid-template-rows: minmax(0, 1fr) auto')
    expect(concept).not.toContain('Cerca nome o nickname…')
    expect(concept).toContain('grid-template-columns: minmax(0, 0.88fr) minmax(430px, 1.12fr)')
    expect(concept).not.toContain('Salta')
  })

  it('mantiene il Concept compatto e riparte sempre dall inizio della vista', () => {
    expect(concept).toContain("scrollParent.scrollTop = 0")
    expect(concept).toContain("document.documentElement.scrollTop = 0")
    expect(concept).toContain('window.scrollTo({ top: 0, behavior: "auto" })')
    expect(concept).toContain('align-self: start')
    expect(concept).toContain('.pwc button:focus-visible')
    expect(concept).not.toContain('v-if="index===0" class="pwc-btn"')
  })

  it('riserva la gestione Crew al proprietario senza indebolire Assisti', () => {
    expect(concept).toContain('activeCrew.value.ownerId === PITWALL_CONCEPT_CURRENT_USER_ID')
    expect(concept).toContain('v-if="isActiveCrewOwner && person.id !== activeCrew.ownerId"')
    expect(concept).toContain(':aria-label="`Gestisci ${person.handle.replace(\'@\', \'\')}`"')
    expect(concept).toContain('class="pwc-crew-person__identity"')
    expect(concept).toContain('class="pwc-crew-person__state"')
    expect(concept).toContain('class="pwc-btn is-primary"')
    expect(concept).toContain('Rimuovi dalla Crew')
    expect(concept).toContain('aria-label="Torna a richieste e inviti"')
    expect(concept).toContain('Perderà l\'accesso permanente ottenuto tramite questa Crew.')
    expect(concept).toContain('role="dialog" aria-modal="true"')
    expect(concept).not.toContain('Impostazioni')
  })

  it('mantiene il contratto visuale racing senza comprimere le righe operative', () => {
    expect(concept).toContain('--pwc-surface')
    expect(concept).toContain('background-size: auto, 48px 48px, 48px 48px')
    expect(concept).toContain('.pwc-command::before')
    expect(concept).toContain('grid-template-columns: minmax(0, 1.82fr) minmax(360px, 0.82fr)')
    expect(concept).toContain('.pwc-wall > div { display: grid; grid-template-columns: 92px minmax(0, 1fr)')
    expect(concept).toContain('.pwc-pit-row { min-height: 30px; }')
  })

  it('separa directory, Crew e collegamenti recenti senza lista amici', () => {
    expect(concept).not.toContain('<span class="pwc-kicker">Pit Wall Concept</span>')
    expect(concept).not.toContain('<h1>Pit Wall</h1>')
    expect(concept).not.toContain('class="pwc-section-title">Adesso')
    expect(concept).toContain('<h2>Piloti</h2>')
    expect(concept).not.toContain('Collegati a un pilota')
    expect(concept).not.toContain('Cerca una persona o un nickname')
    expect(concept).toContain('class="pwc-search-submit"')
    expect(concept).toContain('Le mie Crew')
    expect(concept).toContain('v-for="crew in PITWALL_CONCEPT_CREWS"')
    expect(concept).toContain('expandedCrewId')
    expect(concept).toContain(':aria-expanded="expandedCrewId === crew.id"')
    expect(concept).toContain('@click="toggleCrew(crew.id)"')
    expect(concept).toContain('class="pwc-crew-chevron"')
    expect(concept).toContain('transform-origin: center')
    expect(concept).toContain("class=\"pwc-crew-expand\"")
    expect(concept).toContain(":inert=\"expandedCrewId !== crew.id\"")
    expect(concept).toContain('.pwc-crew-expand.is-open')
    expect(concept).toContain('transition: grid-template-rows 200ms')
    expect(concept).not.toContain('aria-hidden="true">›</b>')
    expect(concept).toContain('getPitwallConceptCrewMembers')
    expect(concept).toContain('Apri Crew')
    expect(concept).toContain("@click=\"openCrew(crew)\"")
    expect(concept).toContain("@click=\"go('live')\"")
    expect(concept).toContain('Recenti')
    expect(concept).toContain('PITWALL_CONCEPT_RECENTS')
    expect(concept).toContain('filterPitwallConceptPeople')
    expect(concept).toContain('Collegati')
    expect(concept).toContain('Richiedi accesso')
    expect(concept).toContain('describePitwallConceptAccess')
    expect(concept).toContain('class="pwc-access-label"')
    expect(concept).toContain('.pwc-access-label.is-permanent { color: #7dd3fc; }')
    expect(concept).toContain('.pwc-access-label.is-temporary { color: #c4b5fd; }')
    expect(concept).toContain("'is-request-start': person.access === 'none'")
    expect(concept).not.toContain('Ultimi cinque')
    expect(concept).toContain('Per questa gara')
    expect(concept).not.toContain('Richiesta in attesa')
    expect(concept).toContain('min-height: 70px')
    expect(concept).toContain('Nessun utente trovato')
    expect(concept).toContain('if (next === "home")')
    expect(concept).toContain('clearSearch()')
    expect(concept).not.toMatch(/lista amici|Aggiungi amico/i)
    expect(concept).not.toContain('nessuno live')
    expect(concept).not.toContain('crew.live')
    expect(concept).not.toContain('<strong>P7</strong><small>Posizione</small>')
    expect(concept).not.toContain('<strong>Giro 18</strong><small>32 minuti fa</small>')
  })

  it('rende la Crew una directory minimale con azioni contestuali', () => {
    expect(concept).toContain('const crewMemberSearch = ref("")')
    expect(concept).toContain('filteredCrewMembers')
    expect(concept).toContain('class="pwc-crew-roster"')
    expect(concept).toContain('class="pwc-crew-queue"')
    expect(concept).toContain('Richieste e inviti')
    expect(concept).toContain('person.state === \'racing\'')
    expect(concept).toContain('Assisti')
    expect(concept).not.toContain('Attività della Crew')
    expect(concept).not.toContain('Attività recenti')
    expect(concept).not.toContain('class="pwc-filters"')
  })

  it('usa sei copertine Crew locali e nessun upload', () => {
    expect(concept).toContain('PITWALL_CONCEPT_CREW_IMAGES')
    expect(concept).toContain('class="pwc-crew-image"')
    expect(concept).toContain('class="pwc-image-picker"')
    expect(concept).toContain('v-for="image in PITWALL_CONCEPT_CREW_IMAGES"')
    expect(concept).not.toContain('Scegli una delle sei copertine disponibili.')
    expect(concept).not.toMatch(/type="file"|FileReader|upload/i)
  })

  it('mostra la campanella mock globale solo nel Concept', () => {
    expect(topBar).toContain('<PitwallConceptBell v-if="pitwallConceptActive"')
    expect(conceptBell).toContain('Invito alla Crew')
    expect(conceptBell).toContain('Invito temporaneo')
    expect(conceptBell).toContain('is-accept')
    expect(conceptBell).toContain('is-reject')
    expect(conceptBell).toContain('aria-label="`Accetta ${notice.title.toLowerCase()}`"')
    expect(conceptBell).toContain('aria-label="`Rifiuta ${notice.title.toLowerCase()}`"')
    expect(conceptBell).not.toContain('Segna come lette')
    expect(conceptBell).not.toContain('Aggiornamento')
    expect(conceptBell).not.toContain('Ferrari 296 GT3')
    expect(conceptBell).not.toContain('Nürburgring')
    expect(conceptBell).not.toContain('minuti fa')
    expect(conceptBell).not.toMatch(/useActivityFeed|useFirebase/)
  })
})
