import { useEffect, useRef } from 'react';
import { useSuperCanvas } from '../../context/SuperCanvasContext';
import { createImageLayer } from '../superCanvas/layerMath';
import { resolveBackendImageUrl } from '../../utils/backendUrls';
import { layerTransformFingerprint } from './provenance';
import type { Asset } from './assetApi';

async function readImage(url: string): Promise<string> {
  if (url.startsWith('data:image/')) return url;
  const response = await fetch(resolveBackendImageUrl(url), { credentials: 'include' });
  if (!response.ok) throw new Error('参考图无法读取，请重试');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('参考图读取失败'));
    reader.readAsDataURL(blob);
  });
}
export function useReusePattern(onReady: () => void, projectId?: string) {
  const canvas = useSuperCanvas();
  const busy = useRef(false);
  const scope = useRef(0);
  useEffect(() => { scope.current += 1; return () => { scope.current += 1; }; }, [projectId]);
  return async (asset: Asset) => {
    if (busy.current) return;
    if (canvas.isGenerating) throw new Error('请等待当前画布生成完成');
    if (!projectId) throw new Error('请先选择项目');
    const startedScope = scope.current;
    busy.current = true;
    try {
      const provenance = asset.payload?.provenance;
      const references = provenance?.references.length ? provenance.references : [{ imageUrl: asset.imageUrl, name: asset.name, sourceAssetId: asset.id, referenceKind: provenance?.referenceKind ?? 'generated' as const, transformFingerprint: provenance?.transformFingerprint, sourcePatterns: provenance?.sourcePatterns ?? [] }];
      const restored = await Promise.all(references.map(async (ref, i) => {
        const src = await readImage(ref.imageUrl);
        const image = new Image();
        const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => reject(new Error('参考图解码失败'));
          image.src = src;
        });
        const layer = {
          ...createImageLayer({ id: `reuse-${crypto.randomUUID()}`, name: ref.name || `参考图 ${i + 1}`, src, dropPoint: { x: 180 + (i % 3) * 260, y: 180 + Math.floor(i / 3) * 260 }, naturalWidth: dimensions.width, naturalHeight: dimensions.height, sourcePattern: ref.sourcePatterns?.[0] }),
          sourceAssetId: ref.sourceAssetId,
          referenceKind: ref.referenceKind || (ref.sourceAssetId ? 'generated' as const : 'derived' as const),
          provenance: { version: 1 as const, originalPrompt: '', sourcePatterns: ref.sourcePatterns ?? [], references: [] },
        };
        return { ...layer, savedTransformFingerprint: layerTransformFingerprint(layer), savedAssetTransformFingerprint: ref.transformFingerprint ?? '' };
      }));
      if (scope.current !== startedScope) throw new Error('项目已切换，已取消载入');
      canvas.setLayers(old => [...old, ...restored]);
      canvas.setSelectedLayerIds(restored.map(l => l.id));
      canvas.setSelectedLayerId(restored[0]?.id ?? null);
      canvas.setPrompt(provenance?.originalPrompt || asset.payload?.prompt || '');
      canvas.setTool('select');
      canvas.setStatusMessage(provenance?.references.length ? '已载入原参考图和提示词，可修改后生成' : '历史参考图未记录，已载入收藏纹样作为调整起点');
      onReady();
    } finally { busy.current = false; }
  };
}
