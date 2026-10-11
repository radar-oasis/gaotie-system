import { describe, expect, it } from 'vitest';
import { provenanceForGeneration, provenanceOf } from './provenance';
import type { ImageLayer } from '../superCanvas/types';
const layer = (id: string): ImageLayer => ({ id, name: id, type: 'image', src: `/images/${id}.png`, x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, sourcePattern: { id, name: id, imageUrl: `/images/${id}.png` } });
describe('pattern generation provenance', () => {
  it('preserves all roots across multiple transformation steps and actual immediate inputs', () => {
    const first = provenanceForGeneration([layer('dragon'), layer('phoenix')], '第一次', '/generated/one.png');
    const next = { ...layer('derived'), src: '/generated/one.png', provenance: first };
    const result = provenanceForGeneration([next, layer('dragon')], '第二次', '/generated/two.png', '优化');
    expect(result.sourcePatterns.map(p => p.id)).toEqual(['dragon', 'phoenix']);
    expect(result.references.map(r => r.imageUrl)).toEqual(['/generated/one.png', '/images/dragon.png']);
    expect(result.originalPrompt).toBe('第二次');
    expect(result.optimizedPrompt).toBe('优化');
  });
  it('does not invent reference images or prompts for legacy generated layers', () => {
    const result = provenanceOf({ ...layer('dragon'), generated: true });
    expect(result.sourcePatterns[0].id).toBe('dragon');
    expect(result.references).toEqual([]);
    expect(result.originalPrompt).toBe('');
  });
});

it('records original references explicitly and detaches changed crops from saved identity', () => {
 const original = layer('dragon');
 expect(provenanceForGeneration([original], 'p','/out').references[0]).toMatchObject({referenceKind:'original',sourcePatternId:'dragon'});
 const saved = {...original, generated:true, sourceAssetId:'favorite',savedTransformFingerprint:'old', crop:{left:.1,right:0,top:0,bottom:0}};
 const reference=provenanceForGeneration([saved], 'p','/out').references[0];
 expect(reference).toMatchObject({referenceKind:'derived', sourceAssetId:'favorite'});
 expect((reference as any).transformFingerprint).toBeTruthy();
 expect(provenanceOf(saved)).toMatchObject({referenceKind:'derived', sourceAssetId:'favorite'});
});

it('records the exact rendered reference image while retaining the source transform fingerprint',()=>{
 const cropped={...layer('dragon'),crop:{left:.2,right:0,top:0,bottom:0}};
 const p=(provenanceForGeneration as any)([cropped],'generate','/output',undefined,['data:image/png;base64,rendered']);
 expect(p.references[0].imageUrl).toBe('data:image/png;base64,rendered');
 expect(p.references[0].originalImageUrl).toBe(cropped.src);
 expect(p.references[0].referenceKind).toBe('derived');
});
