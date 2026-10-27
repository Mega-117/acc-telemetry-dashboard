// PIP-665: dictionary types, apart from index.ts so the English files do not import the module that imports them.
import type it from './it'

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> }
type Paths<T, P extends string = ''> = { [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`> }[keyof T & string]
export type Dictionary = typeof it
export type TranslationKey = Paths<Dictionary>
export type PartialDictionary = DeepPartial<Dictionary>
