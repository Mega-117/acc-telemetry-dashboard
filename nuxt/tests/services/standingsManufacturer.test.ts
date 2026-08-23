import { describe, expect, it } from 'vitest'
import { standingsManufacturerLogo } from '../../app/services/overlay/standingsManufacturer'

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
})
