import { normalizeProvenance } from './asset-provenance';
import { BadRequestException } from '@nestjs/common';
import { AssetsService, referenceImageId } from './assets.service';
describe('asset provenance', () => {
  it('rejects unbounded or malformed references before reading images', () => {
    expect(() => normalizeProvenance({ version: 1, sourcePatterns: [], references: Array(13).fill({ imageUrl: '/a' }) })).toThrow(BadRequestException);
    expect(() => normalizeProvenance({ version: 1, sourcePatterns: [{ id: 42 }], references: [] })).toThrow(BadRequestException);
  });
  it('preserves prompt, multi-source original IDs and immediate references', () => {
    const p = normalizeProvenance({ version: 1, originalPrompt: '提取纹样', optimizedPrompt: '保持透明', sourcePatterns: [{ id: 'P1', name: '龙' }, { id: 'P2', name: '凤' }], references: [{ imageUrl: '/images/source.png', sourcePatterns: [{ id: 'P1', name: '龙' }] }] });
    expect(p?.sourcePatterns.map(s => s.id)).toEqual(['P1', 'P2']);
    expect(p?.references[0].imageUrl).toBe('/images/source.png');
    expect(p?.originalPrompt).toBe('提取纹样');
  });
  it('does not fabricate provenance for historical assets', () => expect(normalizeProvenance(undefined)).toBeUndefined());
  it('authenticates saved reference images and rejects host lookalikes', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = new AssetsService(db as any);
    const id = '11111111-1111-4111-8111-111111111111';
    await expect(service.readImage('owner', `/assets/references/${id}/image`)).rejects.toThrow('参考图不存在');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('user_id = $1'), ['owner', id]);
    expect(referenceImageId(`http://localhost.evil:3000/assets/references/${id}/image`)).toBeNull();
    expect(referenceImageId(`http://127.0.0.1:3000/assets/references/${id}/image`)).toBe(id);
  });
});
