import type { CanvasPatternReference, ImageLayer } from '../superCanvas/types';
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
  sourcePatterns: CanvasPatternReference[];
  references: (ReferenceIdentity & { imageUrl: string; originalImageUrl?: string; name?: string; sourceAssetId?: string; sourcePatterns?: CanvasPatternReference[] })[];
  recovered?: boolean;
  notes?: string;
}
export function rootsOf(layer: ImageLayer): CanvasPatternReference[] {
  return layer.provenance?.sourcePatterns ?? (layer.sourcePattern ? [layer.sourcePattern] : []);
}
// Fingerprint only rendered content/transform: moving or renaming a layer cannot change its identity.
export function layerTransformFingerprint(layer: ImageLayer): string {
  let hash = 2166136261;
  for (let i = 0; i < layer.src.length; i++) hash = Math.imul(hash ^ layer.src.charCodeAt(i), 16777619);
  return JSON.stringify([`${layer.src.length}:${(hash >>> 0).toString(16)}`, layer.crop ?? null, layer.flipX ?? false, layer.flipY ?? false, layer.rotation, layer.width, layer.height, layer.opacity]);
}
export function requiresRenderedReference(layer: ImageLayer): boolean {
  return !!layer.crop && Object.values(layer.crop).some(Boolean) || !!layer.flipX || !!layer.flipY || layer.rotation !== 0 || layer.opacity !== 1;
}
export function canvasReferenceIdentity(layer: ImageLayer): ReferenceIdentity {
  const transformFingerprint = layerTransformFingerprint(layer);
  const changed = !!layer.sourceAssetId && layer.savedTransformFingerprint !== transformFingerprint;
  const transformed = requiresRenderedReference(layer);
  const referenceKind = changed || transformed ? 'derived' : layer.referenceKind || (layer.generated || layer.provenance?.originalPrompt ? 'generated' : layer.sourcePattern ? 'original' : 'derived');
  return { referenceKind, sourcePatternId: layer.sourcePattern?.id, sourceAssetId: layer.sourceAssetId, transformFingerprint: !changed && layer.sourceAssetId && layer.savedAssetTransformFingerprint !== undefined ? layer.savedAssetTransformFingerprint : transformFingerprint };
}
export function provenanceForGeneration(layers: ImageLayer[], prompt: string, outputImageUrl: string, optimizedPrompt?: string, renderedReferenceUrls?: string[]): PatternProvenance {
  return {
    referenceKind: 'generated', version: 1, originalPrompt: prompt, optimizedPrompt, outputImageUrl,
    sourcePatterns: [...new Map(layers.flatMap(rootsOf).map(p => [p.id, p])).values()],
    references: layers.map((l,i) => ({ ...canvasReferenceIdentity(l), imageUrl: renderedReferenceUrls?.[i] ?? l.src, originalImageUrl: renderedReferenceUrls?.[i] && renderedReferenceUrls[i] !== l.src ? l.src : undefined, name: l.name, sourceAssetId: l.sourceAssetId, sourcePatterns: rootsOf(l) })),
  };
}
// Legacy records preserve known roots without inventing which images were used.
export function provenanceOf(layer: ImageLayer): PatternProvenance {
  return { ...(layer.provenance ?? {
    version: 1, originalPrompt: layer.promptTrace?.originalPrompt ?? '',
    optimizedPrompt: layer.promptTrace?.optimizedPrompt, outputImageUrl: layer.src,
    sourcePatterns: rootsOf(layer), references: [],
    notes: '历史记录未保存生成参考图。',
  }), ...canvasReferenceIdentity(layer) };
}
