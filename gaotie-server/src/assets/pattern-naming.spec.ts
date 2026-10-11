import { patternNameRoot, requestedPatternSequence } from './pattern-naming';
describe('pattern naming', () => {
  it('retains the original full name and recognizes an existing canvas suffix', () => {
    const name = '唐李嗣本墓志上的石刻十二生肖之龙纹';
    expect(patternNameRoot([{id:'P00528',name}])).toEqual({key:'["P00528"]',base:name});
    expect(requestedPatternSequence(`${name}-12`,name)).toBe(12);
    expect(requestedPatternSequence('AI 转化纹样',name)).toBe(1);
  });
  it('uses deterministic root groups and a neutral fallback', () => {
    expect(patternNameRoot([{id:'b',name:'凤'}, {id:'a',name:'龙'}])).toEqual({key:'["a","b"]',base:'龙等2种纹样'});
    expect(patternNameRoot([])).toEqual({key:'[]',base:'转化纹样'});
  });
});
