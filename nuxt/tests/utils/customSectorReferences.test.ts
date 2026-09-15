import { describe, expect, it } from 'vitest'
import { adjustSectorReferenceTime, parseSectorReferenceTime, resolveCustomSectorTimes, formatCustomSectorDelta, sectorReferenceContextKey } from '~/utils/customSectorReferences'
import { resolveSectorDeltaPresentation } from '~/utils/sectorDeltaPresentation'
import type { SectorHudEntry } from '~/composables/useLiveStatePoller'
describe('custom sector references', () => {
 it.each([['10',10000],['70.0',70000],['32,5',32500],['27.0',27000],['16.8',16800]])('parses %s', (text, ms) => expect(parseSectorReferenceTime(String(text))).toBe(ms))
 it.each(['9.9','70.1','10.01','1e1','','x','-10','10.0.0'])('rejects %s', text => expect(parseSectorReferenceTime(text)).toBeNull())
 it('clamps wheel steps and separates track/car contexts', () => {
  expect(adjustSectorReferenceTime('70,0',1)).toBe('70,0')
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
  expect(resolveSectorDeltaPresentation(sector,'previousLap')).toEqual({deltaMs:-10,color:'purple'})
 })
})
