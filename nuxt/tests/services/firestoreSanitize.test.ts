import { describe, it, expect } from 'vitest'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'

describe('sanitizeForFirestore', () => {
  it('sostituisce undefined con null', () => {
    expect(sanitizeForFirestore(undefined)).toBeNull()
  })

  it('lascia null invariato', () => {
    expect(sanitizeForFirestore(null)).toBeNull()
  })

  it('lascia stringhe invariate', () => {
    expect(sanitizeForFirestore('ciao')).toBe('ciao')
  })

  it('lascia numeri invariati', () => {
    expect(sanitizeForFirestore(42)).toBe(42)
  })

  it('lascia booleani invariati', () => {
    expect(sanitizeForFirestore(true)).toBe(true)
    expect(sanitizeForFirestore(false)).toBe(false)
  })

  it('lascia Date invariata', () => {
    const d = new Date('2024-01-01')
    expect(sanitizeForFirestore(d)).toBe(d)
  })

  it('converte undefined nei valori di un oggetto in null', () => {
    const input = { a: 'ok', b: undefined, c: 1 }
    const result = sanitizeForFirestore(input)
    expect(result).toEqual({ a: 'ok', b: null, c: 1 })
  })

  it('converte undefined negli array in null', () => {
    const input = ['a', undefined, 'b']
    const result = sanitizeForFirestore(input)
    expect(result).toEqual(['a', null, 'b'])
  })

  it('sanitizza ricorsivamente oggetti annidati', () => {
    const input = {
      top: 'val',
      nested: { deep: undefined, ok: 'yes' },
      arr: [undefined, { x: undefined }]
    }
    const result = sanitizeForFirestore(input)
    expect(result).toEqual({
      top: 'val',
      nested: { deep: null, ok: 'yes' },
      arr: [null, { x: null }]
    })
  })

  it('non tocca istanze di classi non-plain (es. class instance)', () => {
    class MyClass { value = 42 }
    const inst = new MyClass()
    expect(sanitizeForFirestore(inst)).toBe(inst)
  })

  it('gestisce oggetto vuoto', () => {
    expect(sanitizeForFirestore({})).toEqual({})
  })

  it('gestisce array vuoto', () => {
    expect(sanitizeForFirestore([])).toEqual([])
  })
})
