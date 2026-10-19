import { describe, expect, it } from 'vitest'
import { adjustSectorReferenceField, adjustSectorReferenceTime, parseSectorReferenceTime, splitSectorReferenceTime, resolveCustomSectorTimes, formatCustomSectorDelta, sectorReferenceContextKey } from '~/utils/customSectorReferences'
import { resolveSectorDeltaPresentation } from '~/utils/sectorDeltaPresentation'
import type { SectorHudEntry } from '~/composables/useLiveStatePoller'
describe('custom sector references', () => {
 it('never resolves legacy ACC or another variant for a common four-sector track', () => {
  const context = { gameId: 'qa-orbit-v1', variant: 'reverse', track: 'Spa', car: 'BMW', sectorCount: 4 }
  const times = [10000, 20000, 30000, 40000]
  const references = { '["spa","bmw"]': [30000, 30000, 30000], [sectorReferenceContextKey(context)!]: times }
  expect(resolveCustomSectorTimes(references, context)).toEqual(times)
  for (const patch of [{ gameId: 'evo' }, { variant: 'forward' }, { sectorCount: 3 }]) {
   expect(resolveCustomSectorTimes(references, { ...context, ...patch })).toBeNull()
  }
  expect(resolveCustomSectorTimes(references, { gameId: 'acc', track: 'Spa', car: 'BMW' })).toEqual([30000, 30000, 30000])
 })
 it.each([['10',10000],['70.0',70000],['32,5',32500],['27.0',27000],['16.8',16800],['160,3',160300],['240',240000]])('parses %s', (text, ms) => expect(parseSectorReferenceTime(String(text))).toBe(ms))
 it.each(['9.9','240.1','10.01','1e1','','x','-10','10.0.0','1000'])('rejects %s', text => expect(parseSectorReferenceTime(text)).toBeNull())
 // PIP-556: seconds and tenths are edited independently, tenths never carry.
 it('edits seconds and tenths independently within 10 s – 4:00', () => {
  expect(adjustSectorReferenceField('32,9','tenths',1)).toBe('32,0')
  expect(adjustSectorReferenceField('32,0','tenths',-1)).toBe('32,9')
  expect(adjustSectorReferenceField('32,9','seconds',1)).toBe('33,9')
  expect(adjustSectorReferenceField('59,5','seconds',1)).toBe('60,5')
  expect(adjustSectorReferenceField('10,4','seconds',-1)).toBe('10,0')
  expect(adjustSectorReferenceField('240,0','seconds',1)).toBe('240,0')
  expect(adjustSectorReferenceField('240,0','tenths',1)).toBe('240,0')
  expect(adjustSectorReferenceField('','seconds',1)).toBe('10,0')
  expect(splitSectorReferenceTime('160,3')).toEqual({ seconds: 160, tenths: 3 })
 })
 it('clamps wheel steps and separates track/car contexts', () => {
  expect(adjustSectorReferenceTime('240,0',1)).toBe('240,0')
  expect(adjustSectorReferenceTime('10,0',-1)).toBe('10,0')
  expect(adjustSectorReferenceTime('32,5',1)).toBe('32,6')
  const key=sectorReferenceContextKey({track:' Imola ',car:'BMW'})!
  const map: Record<string, [number, number, number]>={ [key]: [32500,27000,16800] }
  expect(resolveCustomSectorTimes(map,{track:'imola',car:'bmw'})).toEqual([32500,27000,16800])
  expect(resolveCustomSectorTimes(map,{track:'spa',car:'bmw'})).toBeNull()
  expect(resolveCustomSectorTimes(map,{track:'imola',car:'audi'})).toBeNull()
 })
 it.each([[149,'+0.1'],[150,'+0.2'],[-150,'−0.2'],[-49,'+0.0'],[0,'+0.0']])('rounds %s symmetrically to a tenth', (ms,text) => expect(formatCustomSectorDelta(Number(ms))).toBe(text))
 it('compares each completed sector independently; no purple or invented reference', () => {
  const sector={state:'complete',currentMs:27050,deltaMs:-10,color:'purple'} as SectorHudEntry
  expect(resolveSectorDeltaPresentation(sector,'custom',27000)).toEqual({deltaMs:50,color:'red'})
  expect(resolveSectorDeltaPresentation(sector,'custom',27100)).toEqual({deltaMs:-50,color:'green'})
  expect(resolveSectorDeltaPresentation(sector,'custom')).toEqual({deltaMs:null,color:'white'})
  expect(resolveSectorDeltaPresentation({...sector,state:'running'},'custom',27100).deltaMs).toBeNull()
  // PIP-524: a saved previous-lap reference reads as best (no best here -> wait).
  expect(resolveSectorDeltaPresentation(sector,'previousLap')).toEqual({deltaMs:null,color:'white'})
 })
})
