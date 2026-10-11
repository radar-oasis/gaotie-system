import { describe, expect, it } from 'vitest';
import { patternNameRoot, reservePatternName, observePatternNames } from './patternNaming';
const roots = [{ id: 'P00528', name: '唐李嗣本墓志上的石刻十二生肖之龙纹' }];
const storage = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k,v); } }; };
describe('derived pattern names', () => {
  it('retains the complete source name and advances after deletion and remount', () => {
    const s = storage();
    observePatternNames('project', [{ name: `${roots[0].name}-2`, roots }], s);
    expect(reservePatternName('project', roots, [], s)).toBe(`${roots[0].name}-3`);
    expect(reservePatternName('project', roots, [], s)).toBe(`${roots[0].name}-4`);
  });
  it('uses stable roots and never infers an unknown source', () => {
    expect(patternNameRoot([{id:'b',name:'凤'}, {id:'a',name:'龙'}])).toEqual(patternNameRoot([{id:'a',name:'龙'}, {id:'b',name:'凤'}]));
    expect(reservePatternName('unknown', [], [], storage())).toBe('转化纹样-1');
  });
});
