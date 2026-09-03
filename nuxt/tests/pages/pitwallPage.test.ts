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
const conceptLive = read('app/components/pitwall/concept/PitwallConceptLive.vue')
const conceptExpiry = read('app/components/pitwall/concept/PitwallConceptExpiry.vue')
const conceptBell = read('app/components/pitwall/concept/PitwallConceptBell.vue')
const conceptSearch = read('app/components/pitwall/concept/PitwallConceptSearch.vue')
const conceptPeople = read('app/components/pitwall/concept/PitwallConceptPeople.vue')
const conceptWall = read('app/components/pitwall/concept/PitwallConceptWall.vue')
const conceptRaces = read('app/components/pitwall/concept/PitwallConceptRaces.vue')
const conceptPitStop = read('app/components/pitwall/concept/PitwallConceptPitStop.vue')
const conceptState = read('app/composables/usePitwallConceptState.ts')
const conceptModel = read('app/utils/pitwallConcept.ts')
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
    expect(panel).toContain('grid-template-columns: minmax(650px,760px) minmax(420px,520px)')
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
    expect(panel).toContain('grid-template-columns: minmax(650px,760px) minmax(420px,520px)')
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
    expect(panel).toContain('grid-template-columns: minmax(450px,1fr) 150px')
    expect(panel).toContain('width: 116px; height: 220px')
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

  it('le caselle hanno tre stati: accendi, spegni, non toccare', () => {
    // Con una casella booleana "vuoto" voleva dire "non toccare", quindi
    // spegnere una riparazione era impossibile e cio' che l'ingegnere
    // impostava non arrivava fedelmente in macchina.
    expect(panel).toContain('const changeTyres = ref<boolean | null>(null)')
    expect(panel).toContain('changeTyres: changeTyres.value')
    expect(panel).toContain('v-model="changeTyres"')
    // Anche lo spento viaggia nell'ordine: `false` e' una richiesta, `null` no.
    expect(panel).toContain('if (changeTyres.value != null) payload.changeTyres = changeTyres.value')
    for (const field of ['brakes', 'repairSuspension', 'repairBodywork']) {
      expect(panel).toContain(`const ${field} = ref<boolean | null>(null)`)
      expect(panel).toContain(`v-model="${field}"`)
    }
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
    expect(conceptBell).toContain('width:39px;height:39px')
    expect(conceptBell).not.toContain('width:42px;height:42px')
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
    expect(conceptLive).not.toMatch(/useFirebase|usePitwallRoom|usePitwallLink|window\.electron|ipcRenderer|\$fetch|useFetch/)
  })

  it('riduce il Concept a due sole schermate: la home e la gara', () => {
    expect(concept).toContain('screen === \'home\'')
    expect(concept).toContain('<PitwallConceptLive')
    expect(concept).toContain('@back="go(\'home\')"')
    // Le Crew non esistono piu': collegarsi non passa dal fondare una squadra.
    expect(concept).not.toMatch(/crew/i)
    expect(conceptLive).not.toMatch(/crew/i)
    expect(concept).not.toContain('PITWALL_CONCEPT_CREW_IMAGES')
    expect(concept).not.toContain('Copertina')
  })

  it('lascia nella schermata di assistenza il solo pit stop, sotto il bottone indietro', () => {
    // Via l'header di gara e via la colonna timing/pista: quelle informazioni
    // il muretto le legge in ACC, qui resta la sola decisione da mandare.
    expect(conceptLive).toContain('class="pwc-back pwc-live__back"')
    expect(conceptLive).toContain('@click="$emit(\'back\')"')
    expect(conceptLive).toContain('width: min(820px, 100%)')
    expect(conceptLive).toContain('<PitwallConceptPitStop')
    for (const gone of [
      'pwc-command',
      'pwc-live-grid',
      'pwc-table',
      'pwc-track',
      'pwc-metrics',
      'liveTab',
      'Timing',
      'Pista',
      'Autonomia',
      'Ferrari 296 GT3',
    ]) {
      expect(conceptLive).not.toContain(gone)
    }
    // Intestazione e righe condividono la stessa griglia: i valori restano
    // incolonnati sotto Campo / Strategia / In macchina.
    expect(conceptPitStop.match(/grid-template-columns: minmax\(0, 1fr\) 180px 116px/g) ?? []).toHaveLength(1)
  })

  it('copre tutto il Pit MFD tranne il limitatore, nell ordine del gioco', () => {
    // Le quindici voci misurate sul MFD reale meno il limitatore pits, che e' il
    // limite dei 50 km/h e non una decisione del muretto.
    const voci = [
      'Preset strategia',
      'Carburante',
      'Cambio gomme',
      'Set pneumatici',
      'Mescola',
      'Pressioni',
      'Sostituisci freni',
      'Prossimo pilota',
      'Riparazioni',
      'Sospensioni',
      'Carrozzeria',
      'Tempo stop stimato',
    ]
    let cursore = -1
    for (const voce of voci) {
      const trovato = conceptPitStop.indexOf(`<span>${voce}</span>`)
      expect(trovato, voce).toBeGreaterThan(cursore)
      cursore = trovato
    }
    expect(conceptPitStop).not.toContain('Limitatore')
    // Il tempo non ha una seconda formula: e' la stessa della vista classica.
    expect(conceptPitStop).toContain('estimatePitStop')
    expect(conceptPitStop).toContain('formatStopDuration')
  })

  it('legge la colonna In macchina da una fonte sola invece che dal template', () => {
    // Prima "25.0", "Dry" e "0 L" erano scritti a mano nelle celle: due copie
    // dello stesso stato che potevano divergere.
    expect(conceptPitStop).toContain('const car = Object.freeze({')
    for (const cella of ['{{ car.preset }}', '{{ car.fuel }} L', '{{ car.tyreSet }}', '{{ car.compound }}', '{{ car.pressure.toFixed(1) }}', '{{ yesNo(car.suspension) }}', '{{ yesNo(car.bodywork) }}']) {
      expect(conceptPitStop).toContain(cella)
    }
  })

  it('apre la gara, non una persona, e dice perche ci sei dentro', () => {
    expect(concept).toContain('In gara adesso')
    expect(concept).toContain('<PitwallConceptRaces')
    expect(concept).toContain('@enter="enter"')
    expect(conceptRaces).toContain('Entra')
    expect(conceptRaces).toContain('class="pwc-race__why"')
    expect(conceptRaces).toContain('describePitwallConceptReason(race.reason)')
    expect(conceptModel).toContain('ti ha autorizzato.')
    expect(conceptRaces).toContain('Al volante')
    expect(conceptRaces).toContain('Al muretto')
    expect(conceptRaces).toContain('Nessuna gara attiva fra le tue persone.')
    expect(concept).not.toContain('Collegati')
    expect(concept).not.toContain('Assisti')
  })

  it('distingue la gara in cui sei da quella in cui sei solo invitato', () => {
    // `amInvited` esisteva gia' nel dominio e non era usato da nessun template:
    // senza, l'unico stato visibile era "sei dentro" anche quando non lo eri.
    expect(conceptRaces).toContain('pitwallConceptAmInvited(race)')
    expect(conceptRaces).toContain('Non sei ancora entrato.')
    expect(conceptRaces).toContain('.pwc-race.is-invited')
    expect(conceptRaces).toContain('.pwc-race.is-closed')
    expect(conceptRaces).toContain('Chiusa')
  })

  it('gestisce le persone in una lista sola nei due versi', () => {
    expect(concept).toContain('Le mie persone')
    expect(concept).toContain('Posso assistere')
    expect(concept).toContain('Possono assistermi')
    expect(concept).toContain('<PitwallConceptPeople')
    expect(conceptPeople).toContain('Rimuovi')
    expect(concept).not.toContain('Recenti')
    expect(concept).not.toContain('Richieste e inviti')
  })

  it('ha i due versi nella ricerca, perche autorizzare e chiedere non sono lo stesso gesto', () => {
    // Prima la ricerca aggiungeva la persona a "Posso assistere": era un
    // auto-permesso, un gesto che il dominio non ha e non puo' avere.
    expect(concept).toContain('Chiedi di assisterlo')
    expect(concept).toContain('Può assistermi')
    expect(concept).toContain('ask(person.id)')
    expect(concept).toContain('openGrant(person.id)')
    expect(concept).toContain('grantAlways(person.id)')
    expect(conceptState).toContain('function askToAssist')
    expect(conceptState).toContain('function allowToAssistMe')
  })

  it('mostra le due facce di una richiesta, e come si chiudono', () => {
    expect(conceptPeople).toContain("link.access === 'pending'")
    expect(conceptPeople).toContain("link.access === 'incoming'")
    expect(conceptPeople).toContain('Annulla')
    expect(conceptPeople).toContain('Rifiuta')
    expect(conceptModel).toContain("return link.access === 'pending' ? 'In attesa' : 'Ti ha chiesto'")
    expect(concept).toContain('.pwc-chip.is-waiting')
    expect(concept).toContain('.pwc-chip.is-asking')
  })

  it('dice cosa succede prima di togliere una persona', () => {
    expect(conceptPeople).toContain('function removeWarning')
    expect(conceptPeople).toContain('non vedrà più le tue gare e non potrà mandarti strategie')
    expect(conceptPeople).toContain('Non vedrai più le gare di ')
    expect(conceptPeople).toContain('confirmRemove(link.personId)')
  })

  it('usa parole di durata al posto del gergo dei permessi', () => {
    expect(conceptPeople).toContain('describePitwallConceptAccess')
    expect(concept).toContain('Solo per oggi')
    expect(concept).toContain('.pwc-chip.is-always')
    expect(concept).toContain('.pwc-chip.is-today')
    expect(concept).not.toMatch(/Accesso permanente|Accesso temporaneo|Richiedi accesso|pre-?autorizz/i)
    expect(conceptPeople).not.toMatch(/Accesso permanente|Accesso temporaneo|pre-?autorizz/i)
    expect(conceptLive).toContain('Ospite per oggi')
    expect(conceptLive).toContain('Scade a mezzanotte.')
  })

  it('dice dove si sceglie e si cambia la scadenza di un accesso a tempo', () => {
    expect(conceptExpiry).toContain('PITWALL_CONCEPT_EXPIRY_PRESETS')
    expect(conceptExpiry).toContain('class="pwc-expiry"')
    expect(conceptExpiry).toContain('Scade alle')
    expect(conceptExpiry).toContain('type="time"')
    expect(conceptExpiry).toContain('aria-label="Orario di scadenza"')
    // Un editor solo per tre usi: concedere, accettare per oggi, cambiare dopo.
    expect(concept).toContain('normalizePitwallConceptExpiry')
    expect(concept).toContain('confirmGrant')
    expect(conceptPeople).toContain('normalizePitwallConceptExpiry')
    expect(conceptPeople).toContain("openExpiry(link.personId, 'edit', link.until)")
    expect(conceptPeople).toContain("openExpiry(link.personId, 'accept')")
    expect(conceptPeople).toContain('Cambia scadenza di ')
    expect(concept.match(/<PitwallConceptExpiry/g) ?? []).toHaveLength(1)
    expect(conceptPeople.match(/<PitwallConceptExpiry/g) ?? []).toHaveLength(1)
    expect(concept).not.toContain('.pwc-expiry {')
    expect(conceptPeople).not.toContain('.pwc-expiry {')
  })

  it('chiama le persone col nickname e mai con nome e cognome', () => {
    for (const source of [conceptRaces, conceptPeople, conceptWall, conceptLive]) {
      expect(source).toContain('pitwallConceptNicknameById')
      expect(source).not.toContain('?.name')
    }
    for (const fullName of ['Mario Rossi', 'Luca Bianchi', 'Enrico Saiani', 'Marco Gallo']) {
      for (const source of [concept, conceptLive, conceptRaces, conceptPeople, conceptWall, conceptModel]) {
        expect(source).not.toContain(fullName)
      }
    }
  })

  it('cerca solo per aggiungere, senza riproporre chi e gia collegato', () => {
    // Una ricerca sola per tutto il prototipo: la home aggiunge persone, la
    // gara invita. Chi la monta decide i bottoni, il campo resta uno.
    expect(conceptState).toContain('searchPitwallConceptDirectory')
    expect(conceptSearch).toContain('placeholder: "Cerca nickname"')
    expect(conceptSearch).toContain('emptyLabel: "Nessuno con questo nickname."')
    expect(concept).toContain('<PitwallConceptSearch')
    expect(conceptLive).toContain('<PitwallConceptSearch')
    expect(concept).toContain('Aggiungi una persona')
    expect(concept).toContain('if (next === "home") search.value = "";')
  })

  it('dice da dove si comincia quando non c e ancora nessuno', () => {
    expect(concept).toContain('isFirstRun')
    expect(concept).toContain('class="pwc-start"')
    expect(concept).toContain('Si comincia da una persona')
  })

  it('mostra ruoli e poteri dentro la gara, come la vista classica', () => {
    expect(conceptLive).toContain('<PitwallConceptWall')
    expect(conceptWall).toContain('Equipaggio')
    expect(conceptWall).toContain('describePitwallConceptMember')
    expect(conceptWall).toContain('Promuovi')
    expect(conceptWall).toContain('Togli')
    expect(conceptWall).toContain('Esci dalla gara')
    expect(conceptWall).toContain('Chiudi gara')
    // Chi ha aperto la gara non si tocca: senza di lui nessuno potrebbe gestirla.
    expect(conceptModel).toContain('function pitwallConceptCanRemove')
    expect(conceptModel).toContain('member.personId !== race?.hostId')
    expect(conceptWall).toContain('pitwallConceptCanRemove(race, member)')
    expect(conceptWall).toContain('pitwallConceptCanPromote(race, member)')
  })

  it('invita alla gara con la stessa ricerca, invece di due nomi scritti a mano', () => {
    expect(conceptLive).toContain('+ Ospite')
    expect(conceptLive).toContain('function invite')
    expect(conceptLive).toContain('state.inviteToRace(race.value.id, personId)')
    expect(conceptLive).not.toContain("['alessandro', 'martina']")
    expect(conceptLive).toContain('Cerca chi invitare')
  })

  it('non finge di poter inviare: dice quale cosa lo blocca', () => {
    expect(conceptPitStop).toContain('pitwallConceptSendBlock')
    expect(conceptPitStop).toContain(':disabled="Boolean(blocked)"')
    expect(conceptPitStop).toContain('class="pwc-blocked"')
    for (const reason of [
      'Nessuna gara selezionata.',
      'Questa gara è chiusa: non accetta più strategie.',
      'Non sei ancora entrato in questa gara.',
      'Nessuno è al volante: nessun ordine parte.',
      'Nessuna modifica da inviare.',
    ]) {
      expect(conceptModel).toContain(reason)
    }
    expect(conceptModel).toContain('nessun ordine parte finché non è chiaro chi guida')
  })

  it('tiene distinti i due esiti di campo invece di appiattirli in un fatto', () => {
    // ACC rilegge solo una parte dei campi: dichiarare gli altri "verificati"
    // sarebbe un falso verde, ed e' il principio che regge tutto il Pit Wall.
    expect(conceptPitStop).toContain('const READ_BACK = new Set(')
    expect(conceptPitStop).toContain('is-verified')
    expect(conceptPitStop).toContain('is-selected')
    expect(conceptPitStop).toContain('dati macchina di 4s fa')
  })

  it('tiene un solo foglio di stile con ritmo e allineamenti dichiarati', () => {
    expect(concept).toContain('--pwc-line')
    expect(concept).toContain('--pwc-surface')
    expect(concept).toContain('--pwc-raised')
    expect(concept).toContain('.pwc-home {')
    expect(concept).toContain('width: min(1180px, 100%)')
    // Due colonne sotto la fascia gara, che invece resta a tutta larghezza.
    expect(concept).toContain('grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr)')
    expect(concept).toContain('.pwc-home__races { grid-column: 1 / -1; }')
    expect(concept).toContain('grid-template-columns: 36px minmax(0, 1fr) auto auto')
    expect(concept).toContain('@media (max-width: 980px)')
    expect(concept).toContain('@media (max-width: 760px)')
    expect(conceptLive).toContain('@media (max-width: 760px)')
    expect(concept).toContain('.pwc button:focus-visible')
    // Un solo passaggio di stile per file: niente strati di correzioni sovrapposte,
    // e le basi condivise stanno in un posto solo.
    expect(concept).not.toContain('Visual rhythm pass')
    expect(concept.match(/<style/g) ?? []).toHaveLength(1)
    expect(conceptLive.match(/<style/g) ?? []).toHaveLength(1)
    expect(conceptLive).not.toMatch(/^\.pwc-btn \{/m)
    expect(conceptLive).not.toMatch(/^\.pwc-avatar \{/m)
  })

  it('riparte dall inizio della vista a ogni cambio schermata', () => {
    expect(concept).toContain('window.scrollTo({ top: 0, behavior: "auto" })')
    expect(concept).toContain('document.documentElement.scrollTop = 0')
  })

  it('mostra la campanella mock globale solo nel Concept', () => {
    expect(topBar).toContain('<PitwallConceptBell v-if="pitwallConceptActive"')
    expect(conceptBell).toContain('describePitwallConceptNotice')
    expect(conceptBell).toContain('is-accept')
    expect(conceptBell).toContain('is-reject')
    expect(conceptBell).toContain('aria-label="`Accetta ${describe(notice).title.toLowerCase()}`"')
    expect(conceptBell).toContain('aria-label="`Rifiuta ${describe(notice).title.toLowerCase()}`"')
    expect(conceptBell).not.toMatch(/crew/i)
    expect(conceptBell).not.toMatch(/useActivityFeed|useFirebase/)
  })

  it('accettare dalla campanella fa la cosa promessa, non svuota una lista', () => {
    // Il difetto vecchio: accetta e rifiuta chiamavano entrambi `remove(id)`.
    // Ora gli avvisi vivono nello stesso stato degli elenchi e della gara.
    expect(conceptBell).toContain('usePitwallConceptState')
    expect(conceptBell).toContain('state.acceptNotice(notice.id')
    expect(conceptBell).toContain('state.rejectNotice(notice.id)')
    expect(conceptBell).not.toContain('function remove(')
    expect(conceptState).toContain('function acceptNotice')
    expect(conceptState).toContain('enterRace(notice.raceId)')
    // Tre tipi: due chiedono una decisione, uno informa e basta.
    expect(conceptBell).toContain("notice.kind !== 'granted'")
    expect(conceptModel).toContain("'request' | 'invite' | 'granted'")
  })

  it('tiene lo stato del prototipo in un posto solo, e senza servizi reali', () => {
    expect(conceptState).not.toMatch(/useFirebase|usePitwallRoom|usePitwallLink|window\.electron|ipcRenderer|\$fetch|useFetch/)
    expect(conceptPeople).not.toMatch(/useFirebase|usePitwallRoom|usePitwallLink|window\.electron|ipcRenderer|\$fetch|useFetch/)
    expect(conceptWall).not.toMatch(/useFirebase|usePitwallRoom|usePitwallLink|window\.electron|ipcRenderer|\$fetch|useFetch/)
    expect(conceptSearch).not.toMatch(/useFirebase|usePitwallRoom|usePitwallLink|window\.electron|ipcRenderer|\$fetch|useFetch/)
    // Le fixture sono l'origine, non lo stato: si copiano prima di mutarle.
    expect(conceptState).toContain('function initialStore')
    expect(conceptState).toContain('JSON.parse(JSON.stringify(value))')
  })
})
