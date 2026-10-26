import { describe, expect, it } from 'vitest'
import { standingsManufacturerFromModel, standingsManufacturerLogo } from '../../app/services/overlay/standingsManufacturer'

describe('standingsManufacturerLogo', () => {
  it.each([
    ['aston-martin', 'aston_martin.png', 'Aston Martin'],
    ['audi', 'audi.png', 'Audi'],
    ['bentley', 'bentley.png', 'Bentley'],
    ['bmw', 'bmw.png', 'BMW'],
    ['ferrari', 'ferrari.png', 'Ferrari'],
    ['ford', 'ford.png', 'Ford'],
    ['honda', 'honda.png', 'Honda'],
    ['jaguar', 'jaguar.png', 'Jaguar'],
    ['lamborghini', 'lamborghini.png', 'Lamborghini'],
    ['lexus', 'lexus.png', 'Lexus'],
    ['mclaren', 'mclaren.png', 'McLaren'],
    ['mercedes-amg', 'mercedes.png', 'Mercedes-AMG'],
    ['nissan', 'nissan.png', 'Nissan'],
    ['porsche', 'porsche.png', 'Porsche'],
  ])('risolve %s nel PNG locale %s', (key, fileName, name) => {
    expect(standingsManufacturerLogo(key)).toEqual({
      key,
      src: `/standings/manufacturers/${fileName}`,
      name,
    })
  })

  it.each([null, undefined, '', 'unknown-brand', 17])('usa il PNG neutro per %s', (value) => {
    expect(standingsManufacturerLogo(value)).toEqual({
      key: null,
      src: '/standings/manufacturers/none.png',
      name: 'Costruttore non disponibile',
    })
  })

  it('applica il base path production a loghi noti e fallback', () => {
    const productionPath = (path: string) => `/acc-telemetry-dashboard/docs${path}`

    expect(standingsManufacturerLogo('ferrari', productionPath).src)
      .toBe('/acc-telemetry-dashboard/docs/standings/manufacturers/ferrari.png')
    expect(standingsManufacturerLogo('unknown', productionPath).src)
      .toBe('/acc-telemetry-dashboard/docs/standings/manufacturers/none.png')
  })
})

describe('standingsManufacturerFromModel', () => {
  it('reads the make from the model, including the AMR name for Aston Martin', () => {
    expect(standingsManufacturerFromModel('ferrari_296_gt3')).toBe('ferrari')
    expect(standingsManufacturerFromModel('AMR V8 Vantage GT3')).toBe('aston-martin')
    expect(standingsManufacturerFromModel('amr_v12_vantage_gt3')).toBe('aston-martin')
    expect(standingsManufacturerFromModel('Mercedes AMG GT3 Evo')).toBe('mercedes-amg')
    expect(standingsManufacturerFromModel('chevrolet_camaro_gt4r')).toBeNull()
  })
})
