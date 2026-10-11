import { BadRequestException } from '@nestjs/common';
export interface SourcePattern { id: string; name: string; imageUrl?: string; dynasty?: string; description?: string; motifs?: string[]; carriers?: string[]; materials?: string[]; layouts?: string[]; }
export interface ReferenceIdentity {
  referenceKind?: 'original' | 'generated' | 'capture' | 'derived';
  sourcePatternId?: string;
  sourceAssetId?: string;
  transformFingerprint?: string;
}
export interface PatternProvenance extends ReferenceIdentity {
  version: 1;
  originalPrompt: string;
  optimizedPrompt?: string;
  outputImageUrl?: string;
  sourcePatterns: SourcePattern[];
  references: (ReferenceIdentity & { imageUrl: string; originalImageUrl?: string; name?: string; sourceAssetId?: string; sourcePatterns?: SourcePattern[] })[];
  recovered?: boolean;
  notes?: string;
}
const fail = (): never => { throw new BadRequestException('纹样来源记录格式无效或过大'); };
function string(value: unknown, limit: number, required = false): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) return fail();
  return value.trim();
}
function patterns(value: unknown): SourcePattern[] {
  if (!Array.isArray(value) || value.length > 64) return fail();
  return [...new Map(value.map(p => {
    if (!p || typeof p !== 'object') return fail();
    const pattern: SourcePattern = { id: string(p.id, 256, true), name: string(p.name, 500, true), imageUrl: string(p.imageUrl, 4096), dynasty: string(p.dynasty, 160), description: string(p.description, 8000) };
    for (const key of ['motifs', 'carriers', 'materials', 'layouts'] as const) {
      if (p[key] !== undefined) {
        if (!Array.isArray(p[key]) || p[key].length > 64) return fail();
        pattern[key] = p[key].map(m => string(m, 256, true));
      }
    }
    return [pattern.id, pattern] as const;
  })).values()];
}
function identity(p: Record<string, any>): ReferenceIdentity {
  if (p.referenceKind !== undefined && !['original', 'generated', 'capture', 'derived'].includes(p.referenceKind)) return fail();
  return { referenceKind: p.referenceKind, sourcePatternId: string(p.sourcePatternId, 256), sourceAssetId: string(p.sourceAssetId, 64), transformFingerprint: string(p.transformFingerprint, 8192) };
}
export function normalizeProvenance(input: unknown): PatternProvenance | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== 'object') return fail();
  const p = input as Record<string, unknown>;
  if (p.version !== 1 || !Array.isArray(p.references) || p.references.length > 12) return fail();
  return {
    ...identity(p), version: 1, originalPrompt: string(p.originalPrompt, 48000), optimizedPrompt: string(p.optimizedPrompt, 100000),
    outputImageUrl: string(p.outputImageUrl, 28 * 1024 * 1024), sourcePatterns: patterns(p.sourcePatterns),
    references: p.references.map(r => {
      if (!r || typeof r !== 'object') return fail();
      return { ...identity(r), imageUrl: string(r.imageUrl, 28 * 1024 * 1024, true), originalImageUrl: string(r.originalImageUrl, 28 * 1024 * 1024), name: string(r.name, 500), sourceAssetId: string(r.sourceAssetId, 64), sourcePatterns: patterns(r.sourcePatterns ?? []) };
    }),
    recovered: p.recovered === true, notes: string(p.notes, 4000),
  };
}
