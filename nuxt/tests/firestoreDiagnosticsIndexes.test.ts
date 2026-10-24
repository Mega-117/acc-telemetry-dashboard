import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLIENT_DIAGNOSTIC_EQUALITY_FILTERS } from '~/repositories/clientDiagnosticsRepository'

// PIP-540: un filtro di Diagnostica senza indice fallisce in produzione con
// failed-precondition, mentre l'emulatore non lo segnala. Ogni combinazione
// di filtri deve avere l'indice della pagina e quello del conteggio.
interface IndexField { fieldPath: string, order?: string }
interface CompositeIndex { collectionGroup: string, queryScope: string, fields: IndexField[] }

const indexes = (JSON.parse(readFileSync(resolve(__dirname, '../../firestore.indexes.json'), 'utf8')) as {
  indexes: CompositeIndex[]
}).indexes.filter(index => index.collectionGroup === 'diagnostics' && index.queryScope === 'COLLECTION_GROUP')

function hasIndex(equality: string[], tail: IndexField[]): boolean {
  return indexes.some(index => {
    const head = index.fields.slice(0, equality.length)
    return index.fields.length === equality.length + tail.length
      && head.every(field => field.order === 'ASCENDING')
      && head.map(field => field.fieldPath).sort().join() === [...equality].sort().join()
      && index.fields.slice(equality.length).every((field, at) =>
        field.fieldPath === tail[at]!.fieldPath && field.order === tail[at]!.order)
  })
}

const combinations = Array.from({ length: (1 << CLIENT_DIAGNOSTIC_EQUALITY_FILTERS.length) - 1 }, (_, offset) =>
  CLIENT_DIAGNOSTIC_EQUALITY_FILTERS.filter((_, bit) => (offset + 1) & (1 << bit)))

describe('indici Firestore della Diagnostica', () => {
  it.each(combinations.map(fields => [fields.join(' + '), fields]))('%s ha indice pagina e conteggio', (_, fields) => {
    expect(hasIndex(fields as string[], [
      { fieldPath: 'receivedAt', order: 'DESCENDING' },
      { fieldPath: '__name__', order: 'DESCENDING' }
    ])).toBe(true)
    expect(hasIndex(fields as string[], [{ fieldPath: 'receivedAt', order: 'ASCENDING' }])).toBe(true)
  })
})
