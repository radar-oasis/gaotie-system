import { observePatternNames, reservePatternName } from './patternNaming';
import { provenanceForGeneration, provenanceOf, rootsOf, layerTransformFingerprint, requiresRenderedReference } from '../assets/provenance';
import FavoriteButton from '../assets/FavoriteButton';
import { exportFavorite } from '../assets/favoriteImage';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react';
import {
  ArrowUpIcon,
  BrushIcon,
  ClearFormattingIcon,
  CursorIcon,
  DeleteIcon,
  ImageAddIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'tdesign-icons-react';
import { useImageSearch, type Pattern } from '../../context/ImageSearchContext';
import { useSuperCanvas } from '../../context/SuperCanvasContext';
import {
  createImageLayer,
  cropLayerFromPointer,
  getImageLayerCrop,
  resolveDropPoint,
  rotateImageLayer,
  scaleImageLayer,
} from './layerMath';
import { exportLayersToPng } from './renderCanvas';
import { generateTransparentAsset } from './superCanvasApi';
import { resolveBackendImageUrl } from './imageUrls';
import type {
  CanvasPatternReference,
  CanvasLayer,
  CaptureItem,
  GenerationPlaceholderLayer,
  ImageLayer,
} from './types';
import './SuperCanvasPage.css';
import FloatingCanvasPanel from './FloatingCanvasPanel';
import './CanvasWorkspace.css';

const ASSET_TRANSFER_KEY = 'application/x-super-canvas-asset';
const CANVAS_WIDTH = 1440;
const CANVAS_HEIGHT = 820;
const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 420;
const MIN_CAPTURE_SIZE = 8;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const GENERATION_PLACEHOLDER_WIDTH = 260;
const GENERATION_PLACEHOLDER_HEIGHT = 180;

type DragAsset = {
  captureId?: string;
  name: string;
  src: string;
  sourcePattern?: CanvasPatternReference;
};

type DragState = {
  layerIds: string[];
  startPoint: { x: number; y: number };
  startLayers: ImageLayer[];
};

type CaptureDraft = {
  start: { x: number; y: number };
  current: { x: number; y: number };
};

type LayerContextMenu = {
  layerId: string;
  x: number;
  y: number;
};

type LayerOrderAction = 'forward' | 'backward' | 'front' | 'back';

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';
type CropFrameHandle = 'n' | 'e' | 's' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

const TRANSFORM_CORNERS: Array<[ResizeHandle, string]> = [
  ['nw', '左上'],
  ['ne', '右上'],
  ['sw', '左下'],
  ['se', '右下'],
];

const CROP_FRAME_HANDLES: Array<[CropFrameHandle, string]> = [
  ['nw', '左上'],
  ['n', '上侧'],
  ['ne', '右上'],
  ['e', '右侧'],
  ['se', '右下'],
  ['s', '下侧'],
  ['sw', '左下'],
  ['w', '左侧'],
];

const createId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const getCroppedImageStyle = (layer: ImageLayer): CSSProperties => {
  const crop = getImageLayerCrop(layer);
  const visibleWidth = Math.max(0.05, 1 - crop.left - crop.right);
  const visibleHeight = Math.max(0.05, 1 - crop.top - crop.bottom);

  return {
    width: `${100 / visibleWidth}%`,
    height: `${100 / visibleHeight}%`,
    transform: `translate(-${crop.left * 100}%, -${crop.top * 100}%)`,
  };
};

const distanceBetweenPoints = (
  first: { x: number; y: number },
  second: { x: number; y: number },
): number => Math.hypot(first.x - second.x, first.y - second.y);

const angleBetweenPoints = (
  center: { x: number; y: number },
  point: { x: number; y: number },
): number => Math.atan2(point.y - center.y, point.x - center.x);

const radiansToDegrees = (radians: number): number => (radians * 180) / Math.PI;

const resizeLayerFromPointer = (
  startLayer: ImageLayer,
  startPoint: { x: number; y: number },
  currentPoint: { x: number; y: number },
): ImageLayer => {
  const center = {
    x: startLayer.x + startLayer.width / 2,
    y: startLayer.y + startLayer.height / 2,
  };
  const startDistance = distanceBetweenPoints(center, startPoint);
  const currentDistance = distanceBetweenPoints(center, currentPoint);

  if (startDistance <= 0) {
    return startLayer;
  }

  return scaleImageLayer(startLayer, currentDistance / startDistance);
};

const rotateLayerFromPointer = (
  startLayer: ImageLayer,
  startPoint: { x: number; y: number },
  currentPoint: { x: number; y: number },
): ImageLayer => {
  const center = {
    x: startLayer.x + startLayer.width / 2,
    y: startLayer.y + startLayer.height / 2,
  };
  const startAngle = angleBetweenPoints(center, startPoint);
  const currentAngle = angleBetweenPoints(center, currentPoint);

  return rotateImageLayer(
    startLayer,
    startLayer.rotation + radiansToDegrees(currentAngle - startAngle),
  );
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = src;
  });

const normalizeRect = (draft: CaptureDraft) => {
  const x = Math.min(draft.start.x, draft.current.x);
  const y = Math.min(draft.start.y, draft.current.y);
  const width = Math.abs(draft.current.x - draft.start.x);
  const height = Math.abs(draft.current.y - draft.start.y);

  return { x, y, width, height };
};

const createGenerationPlaceholderLayer = (
  id: string,
  prompt: string,
  selectedImageLayer: ImageLayer | null,
): GenerationPlaceholderLayer => {
  if (selectedImageLayer) {
    return {
      id,
      type: 'generation-placeholder',
      name: 'AI 转化中',
      prompt,
      x: selectedImageLayer.x,
      y: selectedImageLayer.y,
      width: selectedImageLayer.width,
      height: selectedImageLayer.height,
      opacity: 1,
    };
  }

  return {
    id,
    type: 'generation-placeholder',
    name: 'AI 转化中',
    prompt,
    x: CANVAS_WIDTH / 2 - GENERATION_PLACEHOLDER_WIDTH / 2,
    y: CANVAS_HEIGHT / 2 - GENERATION_PLACEHOLDER_HEIGHT / 2,
    width: GENERATION_PLACEHOLDER_WIDTH,
    height: GENERATION_PLACEHOLDER_HEIGHT,
    opacity: 1,
  };
};

const parseDragAsset = (serializedAsset: string): DragAsset | null => {
  try {
    const parsed = JSON.parse(serializedAsset) as unknown;

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('name' in parsed) ||
      !('src' in parsed)
    ) {
      return null;
    }

    const { name, src } = parsed;

    if (typeof name !== 'string' || typeof src !== 'string') {
      return null;
    }

    const trimmedName = name.trim();
    const trimmedSrc = src.trim();

    if (!trimmedName || !trimmedSrc) {
      return null;
    }

    return {
      captureId: typeof (parsed as Record<string, unknown>).captureId === 'string' ? (parsed as Record<string, unknown>).captureId as string : undefined,
      name: trimmedName,
      src: trimmedSrc,
      sourcePattern: normalizeCanvasPatternReference(
        (parsed as Record<string, unknown>).sourcePattern,
      ),
    };
  } catch {
    return null;
  }
};

const normalizeCanvasPatternReference = (
  value: unknown,
): CanvasPatternReference | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const source = value as Record<string, unknown>;

  if (typeof source.id !== 'string' || typeof source.name !== 'string') {
    return undefined;
  }

  return {
    id: source.id,
    name: source.name,
    imageUrl: typeof source.imageUrl === 'string' ? source.imageUrl : '',
    dynasty: typeof source.dynasty === 'string' ? source.dynasty : undefined,
    description:
      typeof source.description === 'string' ? source.description : undefined,
    carriers: stringArrayOrEmpty(source.carriers),
    materials: stringArrayOrEmpty(source.materials),
    motifs: stringArrayOrEmpty(source.motifs),
    layouts: stringArrayOrEmpty(source.layouts),
  };
};

const patternToCanvasReference = (pattern: Pattern): CanvasPatternReference => ({
  id: pattern.id,
  name: pattern.name,
  imageUrl: pattern.imageUrl,
  dynasty: pattern.dynasty,
  description: pattern.description,
  carriers: pattern.carriers ?? [],
  materials: pattern.materials ?? [],
  motifs: pattern.motifs ?? [],
  layouts: pattern.layouts ?? [],
});

const stringArrayOrEmpty = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const uniquePatternReferences = (
  patterns: Array<CanvasPatternReference | undefined>,
): CanvasPatternReference[] => {
  const result: CanvasPatternReference[] = [];

  for (const pattern of patterns) {
    if (!pattern || result.some((item) => item.id === pattern.id)) {
      continue;
    }

    result.push(pattern);
  }

  return result;
};

export default function SuperCanvasPage({ projectKey: _projectKey = 'local' }: { projectKey?: string }) {
  const { selectedPatterns } = useImageSearch();
  const {
    layers,
    setLayers,
    selectedLayerId,
    setSelectedLayerId,
    selectedLayerIds,
    setSelectedLayerIds,
    tool,
    setTool: setCanvasTool,
    zoom,
    setZoom,
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,
    captures,
    setCaptures,
    prompt,
    setPrompt,
    isGenerating,
    setIsGenerating,
    statusMessage,
    setStatusMessage,
    leftCollapsed,
    setLeftCollapsed,
    rightCollapsed,
    setRightCollapsed,
    leftWidth,
    setLeftWidth,
    rightWidth,
    setRightWidth,
  } = useSuperCanvas();
  const pan = useMemo(() => ({ x: 0, y: 0 }), []);
  const [isPanTool, setIsPanTool] = useState(false);
  const setTool = (next: typeof tool) => { setIsPanTool(false); setCanvasTool(next); };
  const panDragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [captureDraft, setCaptureDraft] = useState<CaptureDraft | null>(null);
  const [layerContextMenu, setLayerContextMenu] =
    useState<LayerContextMenu | null>(null);
  const [cropModeLayerId, setCropModeLayerId] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [completedTrace, setCompletedTrace] = useState<ImageLayer['promptTrace']>();
  const composingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const activeStrokeIdRef = useRef<string | null>(null);
  const isErasingRef = useRef(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const directTransformCleanupRef = useRef<(() => void) | null>(null);
  const cropFrameCleanupRef = useRef<(() => void) | null>(null);
  const generationAbortControllerRef = useRef<AbortController | null>(null);
  const generationPlaceholderIdRef = useRef<string | null>(null);

  const effectiveSelectedLayerIds = useMemo(() => {
    if (selectedLayerIds.length > 0) {
      return selectedLayerIds;
    }

    return selectedLayerId ? [selectedLayerId] : [];
  }, [selectedLayerId, selectedLayerIds]);

  const selectedLayerIdSet = useMemo(
    () => new Set(effectiveSelectedLayerIds),
    [effectiveSelectedLayerIds],
  );

  const selectLayers = useCallback(
    (layerIds: string[]) => {
      const nextLayerIds = Array.from(new Set(layerIds)).filter(Boolean);

      setSelectedLayerIds(nextLayerIds);
      setSelectedLayerId(nextLayerIds.at(-1) ?? null);
    },
    [setSelectedLayerId, setSelectedLayerIds],
  );

  const selectedLayer = useMemo(
    () =>
      layers.find((layer) => layer.id === selectedLayerId) ??
      layers.find((layer) => selectedLayerIdSet.has(layer.id)) ??
      null,
    [layers, selectedLayerId, selectedLayerIdSet],
  );

  const selectedImageLayer =
    selectedLayer?.type === 'image' ? selectedLayer : null;
  const isCropModeActive =
    selectedImageLayer !== null && cropModeLayerId === selectedImageLayer.id;
  const selectedImageLayers = useMemo(
    () =>
      layers.filter(
        (layer): layer is ImageLayer =>
          layer.type === 'image' && selectedLayerIdSet.has(layer.id),
      ),
    [layers, selectedLayerIdSet],
  );
  const selectedSourcePatterns = useMemo(
    () =>
      uniquePatternReferences(
        selectedImageLayers.flatMap(rootsOf),
      ),
    [selectedImageLayers],
  );
  const contextLayerIndex = useMemo(
    () =>
      layerContextMenu
        ? layers.findIndex((layer) => layer.id === layerContextMenu.layerId)
        : -1,
    [layerContextMenu, layers],
  );

  const getCanvasPoint = useCallback(
    (event: Pick<ReactPointerEvent, 'clientX' | 'clientY'>) => {
      const rect = stageRef.current?.getBoundingClientRect();

      if (!rect) {
        return null;
      }

      return resolveDropPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        canvasRect: rect,
        pan,
        zoom,
      });
    },
    [pan, zoom],
  );

  const addImageLayerFromSource = useCallback(
    async (asset: DragAsset, dropPoint: { x: number; y: number }) => {
      const image = await loadImage(asset.src);
      const layer = createImageLayer({
        id: createId('layer'),
        name: asset.name,
        src: asset.src,
        dropPoint,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        sourcePattern: asset.sourcePattern,
      });

      const capture = captures.find(c => c.id === asset.captureId && c.src === asset.src);
      if (capture?.provenance) layer.provenance = capture.provenance;
      if (capture) { layer.referenceKind = 'capture'; layer.sourceAssetId = capture.sourceAssetId; layer.savedTransformFingerprint = layerTransformFingerprint(layer); layer.savedAssetTransformFingerprint = capture.provenance?.transformFingerprint ?? ''; }
      setLayers((currentLayers) => [...currentLayers, layer]);
      selectLayers([layer.id]);
      setStatusMessage(`已添加 ${asset.name}`);
    },
    [selectLayers, captures],
  );

  const moveSelected = useCallback((deltaX: number, deltaY: number) => {
    setLayers((currentLayers) =>
      currentLayers.map((layer) =>
        selectedLayerIdSet.has(layer.id) && layer.type === 'image'
          ? { ...layer, x: layer.x + deltaX, y: layer.y + deltaY }
          : layer,
      ),
    );
  }, [selectedLayerIdSet]);

  const scaleSelectedLayer = useCallback((scale: number) => {
    setLayers((currentLayers) =>
      currentLayers.map((layer) =>
        selectedLayerIdSet.has(layer.id) && layer.type === 'image'
          ? scaleImageLayer(layer, scale)
          : layer,
      ),
    );
  }, [selectedLayerIdSet]);

  const updateSelectedImageLayer = useCallback(
    (updater: (layer: ImageLayer) => ImageLayer) => {
      setLayers((currentLayers) =>
        currentLayers.map((layer) =>
          layer.id === selectedLayerId && layer.type === 'image'
            ? updater(layer)
            : layer,
        ),
      );
    },
    [selectedLayerId],
  );

  const startDirectLayerTransform = useCallback(
    (
      layer: ImageLayer,
      mode: 'resize' | 'rotate',
      event: ReactPointerEvent<HTMLElement>,
    ) => {
      const startPoint = getCanvasPoint(event);

      if (!startPoint) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      directTransformCleanupRef.current?.();
      selectLayers([layer.id]);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const currentPoint = getCanvasPoint(moveEvent);

        if (!currentPoint) {
          return;
        }

        const nextLayer =
          mode === 'resize'
            ? resizeLayerFromPointer(layer, startPoint, currentPoint)
            : rotateLayerFromPointer(layer, startPoint, currentPoint);

        setLayers((currentLayers) =>
          currentLayers.map((currentLayer) =>
            currentLayer.id === layer.id ? nextLayer : currentLayer,
          ),
        );
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', cleanup);
        window.removeEventListener('pointercancel', cleanup);

        if (directTransformCleanupRef.current === cleanup) {
          directTransformCleanupRef.current = null;
        }
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', cleanup);
      window.addEventListener('pointercancel', cleanup);
      directTransformCleanupRef.current = cleanup;
    },
    [getCanvasPoint, selectLayers],
  );

  const startCropFrameTransform = useCallback(
    (
      layer: ImageLayer,
      handle: CropFrameHandle,
      event: ReactPointerEvent<HTMLElement>,
    ) => {
      const startPoint = getCanvasPoint(event);

      if (!startPoint) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      cropFrameCleanupRef.current?.();
      selectLayers([layer.id]);
      setCropModeLayerId(layer.id);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const currentPoint = getCanvasPoint(moveEvent);

        if (!currentPoint) {
          return;
        }

        const nextLayer = cropLayerFromPointer(
          layer,
          handle,
          startPoint,
          currentPoint,
        );

        setLayers((currentLayers) =>
          currentLayers.map((currentLayer) =>
            currentLayer.id === layer.id ? nextLayer : currentLayer,
          ),
        );
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', cleanup);
        window.removeEventListener('pointercancel', cleanup);

        if (cropFrameCleanupRef.current === cleanup) {
          cropFrameCleanupRef.current = null;
        }
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', cleanup);
      window.addEventListener('pointercancel', cleanup);
      cropFrameCleanupRef.current = cleanup;
    },
    [getCanvasPoint, selectLayers],
  );

  const startPanelResize = useCallback(
    (side: 'left' | 'right') => (event: ReactPointerEvent<HTMLButtonElement>) => {
      resizeCleanupRef.current?.();

      const startX = event.clientX;
      const startWidth = side === 'left' ? leftWidth : rightWidth;
      const resizeTarget = event.currentTarget;
      const pointerId = event.pointerId;
      let isCleanedUp = false;

      resizeTarget.setPointerCapture(pointerId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextWidth =
          side === 'left' ? startWidth + delta : startWidth - delta;
        const boundedWidth = clamp(nextWidth, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);

        if (side === 'left') {
          setLeftWidth(boundedWidth);
        } else {
          setRightWidth(boundedWidth);
        }
      };

      const cleanupResize = () => {
        if (isCleanedUp) {
          return;
        }

        isCleanedUp = true;
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', cleanupResize);
        window.removeEventListener('pointercancel', cleanupResize);

        try {
          resizeTarget.releasePointerCapture(pointerId);
        } catch {
          // Pointer capture may already be gone after cancel/unmount.
        }

        if (resizeCleanupRef.current === cleanupResize) {
          resizeCleanupRef.current = null;
        }
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', cleanupResize);
      window.addEventListener('pointercancel', cleanupResize);
      resizeCleanupRef.current = cleanupResize;
    },
    [leftWidth, rightWidth],
  );

  const handleAssetDragStart = (
    asset: DragAsset,
    event: React.DragEvent<HTMLElement>,
  ) => {
    event.dataTransfer.setData(ASSET_TRANSFER_KEY, JSON.stringify(asset));
    event.dataTransfer.effectAllowed = 'copy';
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const serializedAsset = event.dataTransfer.getData(ASSET_TRANSFER_KEY);

    if (!serializedAsset || !stageRef.current) {
      return;
    }

    try {
      const asset = parseDragAsset(serializedAsset);

      if (!asset) {
        setStatusMessage('拖入素材数据无效');
        return;
      }

      const canvasRect = stageRef.current.getBoundingClientRect();
      const dropPoint = resolveDropPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        canvasRect,
        pan,
        zoom,
      });

      await addImageLayerFromSource(asset, dropPoint);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '拖入失败');
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setStatusMessage('仅支持图片文件');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setStatusMessage('图片不能超过 20 MB');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const src = typeof reader.result === 'string' ? reader.result : '';

      if (!src) {
        setStatusMessage('图片读取失败');
        return;
      }

      try {
        await addImageLayerFromSource(
          { name: file.name.replace(/\.[^.]+$/, '') || '上传图片', src },
          { x: 640, y: 360 },
        );
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : '上传失败');
      } finally {
        event.target.value = '';
      }
    };
    reader.onerror = () => {
      setStatusMessage('图片读取失败');
      event.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteSelected = useCallback(() => {
    if (effectiveSelectedLayerIds.length === 0) {
      return;
    }

    setLayers((currentLayers) =>
      currentLayers.filter((layer) => !selectedLayerIdSet.has(layer.id)),
    );
    selectLayers([]);
    setLayerContextMenu(null);
    setStatusMessage('已删除选中图层');
  }, [effectiveSelectedLayerIds.length, selectLayers, selectedLayerIdSet]);

  const duplicateLayers = useCallback(
    (layerIds: string[]) => {
      const layerIdSet = new Set(layerIds);
      const sourceLayers = layers.filter(
        (layer): layer is ImageLayer =>
          layer.type === 'image' && layerIdSet.has(layer.id),
      );

      if (sourceLayers.length === 0) {
        return;
      }

      const duplicatedLayers = sourceLayers.map((layer) => ({
        ...layer,
        id: createId('layer'),
        name: `${layer.name} 副本`,
        x: layer.x + 24,
        y: layer.y + 24,
        crop: getImageLayerCrop(layer),
      }));

      setLayers((currentLayers) => [...currentLayers, ...duplicatedLayers]);
      selectLayers(duplicatedLayers.map((layer) => layer.id));
      setCropModeLayerId(null);
      setLayerContextMenu(null);
      setStatusMessage(`已复制 ${duplicatedLayers.length} 个图层`);
    },
    [layers, selectLayers],
  );

  const handleDuplicateSelected = useCallback(() => {
    duplicateLayers(effectiveSelectedLayerIds);
  }, [duplicateLayers, effectiveSelectedLayerIds]);

  const toggleCropMode = useCallback(() => {
    if (!selectedImageLayer) {
      return;
    }

    const shouldExit = cropModeLayerId === selectedImageLayer.id;

    setTool('select');
    setCropModeLayerId(shouldExit ? null : selectedImageLayer.id);
    setStatusMessage(shouldExit ? '已退出裁剪框' : '已进入裁剪框');
  }, [cropModeLayerId, selectedImageLayer, setTool]);

  const handleDeleteCapture = useCallback((captureId: string) => {
    setCaptures((currentCaptures) =>
      currentCaptures.filter((capture) => capture.id !== captureId),
    );
    setStatusMessage('已删除截取素材');
  }, []);

  const handleAddCaptureToCanvas = useCallback(
    async (capture: CaptureItem) => {
      try {
        await addImageLayerFromSource(
          { name: capture.name, src: capture.src, captureId: capture.id },
          { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
        );
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : '添加截取素材失败');
      }
    },
    [addImageLayerFromSource],
  );

  const reorderLayer = useCallback(
    (layerId: string, action: LayerOrderAction) => {
      setLayers((currentLayers) => {
        const currentIndex = currentLayers.findIndex(
          (layer) => layer.id === layerId,
        );

        if (currentIndex < 0) {
          return currentLayers;
        }

        const nextLayers = [...currentLayers];
        const [layer] = nextLayers.splice(currentIndex, 1);

        if (!layer) {
          return currentLayers;
        }

        const targetIndex = (() => {
          if (action === 'front') {
            return nextLayers.length;
          }

          if (action === 'back') {
            return 0;
          }

          if (action === 'forward') {
            return Math.min(currentIndex + 1, nextLayers.length);
          }

          return Math.max(currentIndex - 1, 0);
        })();

        if (targetIndex === currentIndex) {
          nextLayers.splice(currentIndex, 0, layer);
          return currentLayers;
        }

        nextLayers.splice(targetIndex, 0, layer);

        return nextLayers;
      });

      selectLayers([layerId]);
      setLayerContextMenu(null);
      const messageByAction: Record<LayerOrderAction, string> = {
        forward: '已上移一层',
        backward: '已下移一层',
        front: '已置于顶层',
        back: '已置于底层',
      };
      setStatusMessage(messageByAction[action]);
    },
    [selectLayers],
  );

  const eraseBrushAtPoint = useCallback(
    (point: { x: number; y: number }) => {
      const radius = Math.max(brushSize / 2, 4);

      setLayers((currentLayers) =>
        currentLayers.flatMap<CanvasLayer>((layer) => {
          if (layer.type !== 'stroke') {
            return [layer];
          }

          const remainingPoints = layer.points.filter(
            (strokePoint) => distanceBetweenPoints(strokePoint, point) > radius,
          );

          if (remainingPoints.length < 2) {
            return [];
          }

          return [{ ...layer, points: remainingPoints }];
        }),
      );
      setStatusMessage('已擦除画笔笔迹');
    },
    [brushSize],
  );

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    setLayerContextMenu(null);
    setEditingLayerId(null);

    if (isPanTool) {
      panDragRef.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    if (tool === 'brush') {
      const stroke: CanvasLayer = {
        id: createId('stroke'),
        type: 'stroke',
        color: brushColor,
        size: brushSize,
        points: [point],
      };
      activeStrokeIdRef.current = stroke.id;
      setLayers((currentLayers) => [...currentLayers, stroke]);
      selectLayers([]);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === 'eraser') {
      isErasingRef.current = true;
      selectLayers([]);
      eraseBrushAtPoint(point);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === 'capture') {
      setCaptureDraft({ start: point, current: point });
      selectLayers([]);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    selectLayers([]);
  };

  const handleLayerPointerDown = (
    layer: ImageLayer,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (isPanTool || tool !== 'select' || event.button !== 0) {
      return;
    }

    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    event.stopPropagation();
    setLayerContextMenu(null);
    if (event.shiftKey) {
      const nextLayerIds = selectedLayerIdSet.has(layer.id)
        ? effectiveSelectedLayerIds.filter((layerId) => layerId !== layer.id)
        : [...effectiveSelectedLayerIds, layer.id];

      selectLayers(nextLayerIds);
      return;
    }

    const layerIdsToMove = selectedLayerIdSet.has(layer.id)
      ? effectiveSelectedLayerIds
      : [layer.id];

    selectLayers(layerIdsToMove);
    dragStateRef.current = {
      layerIds: layerIdsToMove,
      startPoint: point,
      startLayers: layers.filter(
        (currentLayer): currentLayer is ImageLayer =>
          currentLayer.type === 'image' && layerIdsToMove.includes(currentLayer.id),
      ),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleLayerContextMenu = (
    layer: ImageLayer,
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    selectLayers([layer.id]);
    setLayerContextMenu({
      layerId: layer.id,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handleStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panDrag = panDragRef.current;
    if (panDrag) {
      event.currentTarget.scrollLeft = panDrag.left + panDrag.x - event.clientX;
      event.currentTarget.scrollTop = panDrag.top + panDrag.y - event.clientY;
      return;
    }
    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    const dragState = dragStateRef.current;

    if (dragState) {
      const deltaX = point.x - dragState.startPoint.x;
      const deltaY = point.y - dragState.startPoint.y;

      setLayers((currentLayers) =>
        currentLayers.map((layer) => {
          const startLayer = dragState.startLayers.find(
            (item) => item.id === layer.id,
          );

          return startLayer
            ? {
                ...layer,
                x: startLayer.x + deltaX,
                y: startLayer.y + deltaY,
              }
            : layer;
        }),
      );
      return;
    }

    if (activeStrokeIdRef.current) {
      const activeStrokeId = activeStrokeIdRef.current;
      setLayers((currentLayers) =>
        currentLayers.map((layer) =>
          layer.id === activeStrokeId && layer.type === 'stroke'
            ? { ...layer, points: [...layer.points, point] }
            : layer,
        ),
      );
      return;
    }

    if (isErasingRef.current) {
      eraseBrushAtPoint(point);
      return;
    }

    if (captureDraft) {
      setCaptureDraft((draft) =>
        draft ? { ...draft, current: point } : draft,
      );
    }
  };

  const finishCapture = useCallback(async () => {
    if (!captureDraft) {
      return;
    }

    const rect = normalizeRect(captureDraft);
    setCaptureDraft(null);

    if (rect.width < MIN_CAPTURE_SIZE || rect.height < MIN_CAPTURE_SIZE) {
      return;
    }

    try {
      const src = await exportLayersToPng(layers, rect);
      const capture: CaptureItem = {
        id: createId('capture'),
        name: `截取 ${captures.length + 1}`,
        src,
        createdAt: new Date().toISOString(),
        provenance: { ...provenanceForGeneration(layers.filter((l): l is ImageLayer => {
          if (l.type !== 'image' || l.opacity <= 0) return false;
          const angle = l.rotation * Math.PI / 180;
          const width = Math.abs(l.width * Math.cos(angle)) + Math.abs(l.height * Math.sin(angle));
          const height = Math.abs(l.width * Math.sin(angle)) + Math.abs(l.height * Math.cos(angle));
          const cx = l.x + l.width / 2, cy = l.y + l.height / 2;
          return cx + width / 2 > rect.x && cx - width / 2 < rect.x + rect.width && cy + height / 2 > rect.y && cy - height / 2 < rect.y + rect.height;
        }), '', src), referenceKind: 'capture', notes: '画布截取：记录与截取区域相交的图片图层，无单次生成提示词。' },
      };

      setCaptures((currentCaptures) => [capture, ...currentCaptures]);
      setStatusMessage('已保存截取素材');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '截取失败');
    }
  }, [captureDraft, captures.length, layers]);

  const handleStagePointerUp = () => {
    panDragRef.current = null;
    dragStateRef.current = null;
    activeStrokeIdRef.current = null;
    isErasingRef.current = false;
    void finishCapture();
  };

  const handleWheelLayer = (
    event: WheelEvent<HTMLDivElement>,
    layerId: string,
  ) => {
    if (!selectedLayerIdSet.has(layerId)) {
      return;
    }

    event.preventDefault();
    scaleSelectedLayer(event.deltaY < 0 ? 1.08 : 0.92);
  };

  const removeGenerationPlaceholder = useCallback(
    (placeholderId: string) => {
      setLayers((currentLayers) =>
        currentLayers.filter((currentLayer) => currentLayer.id !== placeholderId),
      );
      setSelectedLayerIds((currentLayerIds) => {
        const nextLayerIds = currentLayerIds.filter(
          (layerId) => layerId !== placeholderId,
        );
        setSelectedLayerId(nextLayerIds.at(-1) ?? null);
        return nextLayerIds;
      });
      setSelectedLayerId((currentLayerId) =>
        currentLayerId === placeholderId ? null : currentLayerId,
      );
    },
    [setLayers, setSelectedLayerId, setSelectedLayerIds],
  );

  const handleCancelGenerate = useCallback(() => {
    const controller = generationAbortControllerRef.current;

    if (!controller || !isGenerating) {
      return;
    }

    controller.abort();
    generationAbortControllerRef.current = null;

    if (generationPlaceholderIdRef.current) {
      removeGenerationPlaceholder(generationPlaceholderIdRef.current);
      generationPlaceholderIdRef.current = null;
    }

    setIsGenerating(false);
    setStatusMessage('已取消生成');
  }, [isGenerating, removeGenerationPlaceholder, setIsGenerating, setStatusMessage]);

  // Keep the high-water mark even when the newest layer is later removed.
  useEffect(() => {
    observePatternNames(_projectKey, layers.filter((l): l is ImageLayer => l.type === 'image').map(l => ({ name: l.name, roots: rootsOf(l) })), window.localStorage);
  }, [_projectKey, layers]);

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt || isGenerating) {
      return;
    }

    let referenceImageUrls = selectedImageLayers.map((layer) => layer.src);
    const sourcePatternsForGeneration = selectedSourcePatterns;
    const placeholder = createGenerationPlaceholderLayer(
      createId('generation'),
      trimmedPrompt,
      selectedImageLayer,
    );
    const controller = new AbortController();

    generationAbortControllerRef.current = controller;
    generationPlaceholderIdRef.current = placeholder.id;
    setIsGenerating(true);
    setCompletedTrace(undefined);
    setStatusMessage('正在准备参考图…');
    setLayers((currentLayers) => [...currentLayers, placeholder]);
    selectLayers([placeholder.id]);

    try {
      referenceImageUrls = await Promise.all(selectedImageLayers.map(layer => requiresRenderedReference(layer) ? exportFavorite(layer) : Promise.resolve(layer.src)));
      if (controller.signal.aborted) return;
      const result = await generateTransparentAsset({
        prompt: trimmedPrompt,
        ...(referenceImageUrls.length > 1
          ? { referenceImageUrls }
            : referenceImageUrls.length === 1
              ? { referenceImageUrl: referenceImageUrls[0] }
              : {}),
      }, { signal: controller.signal, onProgress: stage => {
        if (controller.signal.aborted || generationPlaceholderIdRef.current !== placeholder.id) return;
        const labels = { preparing: '正在准备参考图…', optimizing: '正在优化提示词…', generating: '正在生成图片…', processing: '正在处理生成图片…' };
        setStatusMessage(labels[stage]);
      } });

      if (
        controller.signal.aborted ||
        generationPlaceholderIdRef.current !== placeholder.id
      ) {
        return;
      }

      const src = resolveBackendImageUrl(result.imageUrl);
      const image = await loadImage(src);

      if (
        controller.signal.aborted ||
        generationPlaceholderIdRef.current !== placeholder.id
      ) {
        return;
      }

      const layer = createImageLayer({
        id: createId('ai'),
        name: reservePatternName(_projectKey, sourcePatternsForGeneration, layers.filter((l): l is ImageLayer => l.type === 'image').map(l => ({ name: l.name, roots: rootsOf(l) })), window.localStorage),
        src,
        dropPoint: {
          x: placeholder.x + placeholder.width / 2,
          y: placeholder.y + placeholder.height / 2,
        },
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        sourcePattern: sourcePatternsForGeneration[0],
      });
      // Fit inside the placeholder without distorting the generated aspect ratio.
      const generatedScale = Math.min(
        placeholder.width / image.naturalWidth,
        placeholder.height / image.naturalHeight,
      );
      const generatedWidth = image.naturalWidth * generatedScale;
      const generatedHeight = image.naturalHeight * generatedScale;
      const replacementLayer: ImageLayer = {
        ...layer,
        generated: true,
        promptTrace: result.promptTrace,
        provenance: provenanceForGeneration(selectedImageLayers, result.promptTrace?.originalPrompt || trimmedPrompt, src, result.promptTrace?.optimizedPrompt, referenceImageUrls),
        x: placeholder.x + (placeholder.width - generatedWidth) / 2,
        y: placeholder.y + (placeholder.height - generatedHeight) / 2,
        width: generatedWidth,
        height: generatedHeight,
      };

      setLayers((currentLayers) =>
        currentLayers.map((currentLayer) =>
          currentLayer.id === placeholder.id ? replacementLayer : currentLayer,
        ),
      );
      selectLayers([replacementLayer.id]);
      setCompletedTrace(result.promptTrace);
      setStatusMessage(
        result.confidence === 'high'
          ? '已生成透明底 PNG'
          : '已生成 PNG，但背景未透明，请检查后再使用',
      );
      generationPlaceholderIdRef.current = null;
    } catch (error) {
      removeGenerationPlaceholder(placeholder.id);
      if (generationAbortControllerRef.current !== controller) return;
      if (controller.signal.aborted) {
        setStatusMessage('已取消生成');
      } else {
        setStatusMessage(error instanceof Error ? error.message : '生成失败');
      }
    } finally {
      if (generationAbortControllerRef.current === controller) {
        generationAbortControllerRef.current = null;
        generationPlaceholderIdRef.current = null;
        setIsGenerating(false);
      }
    }
  };

  useEffect(() => {
    const closeContextMenu = () => setLayerContextMenu(null);
    const closeContextMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLayerContextMenu(null);
        setEditingLayerId(null);
      }
    };

    window.addEventListener('click', closeContextMenu);
    window.addEventListener('keydown', closeContextMenuOnEscape);

    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('keydown', closeContextMenuOnEscape);
    };
  }, []);

  useEffect(() => {
    if (cropModeLayerId && !selectedLayerIdSet.has(cropModeLayerId)) {
      setCropModeLayerId(null);
    }
  }, [cropModeLayerId, selectedLayerIdSet]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        handleDeleteSelected();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        handleDuplicateSelected();
        return;
      }

      const step = event.shiftKey ? 10 : 1;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveSelected(-step, 0);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelected(step, 0);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelected(0, -step);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelected(0, step);
      } else if (event.key === '=' || event.key === '+') {
        scaleSelectedLayer(1.08);
      } else if (event.key === '-') {
        scaleSelectedLayer(0.92);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleDeleteSelected,
    handleDuplicateSelected,
    moveSelected,
    scaleSelectedLayer,
  ]);

  useEffect(
    () => () => {
      resizeCleanupRef.current?.();
      directTransformCleanupRef.current?.();
      cropFrameCleanupRef.current?.();
    },
    [],
  );

  const captureRect = captureDraft ? normalizeRect(captureDraft) : null;
  const canvasStyle: CSSProperties = {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
  };

  return (
    <div className="super-canvas">
      <FloatingCanvasPanel key={`${_projectKey}-patterns`} title="已选纹样" side="left" count={selectedPatterns.length}
        width={leftWidth} collapsed={leftCollapsed} onToggle={() => setLeftCollapsed(value => !value)}>
        {!leftCollapsed && (
          <div className="super-canvas__asset-list">
            {selectedPatterns.length === 0 && (
              <p className="super-canvas__empty">暂无已选纹样</p>
            )}
            {selectedPatterns.map((pattern) => {
              const src = resolveBackendImageUrl(pattern.imageUrl);

              return (
                <article
                  className="super-canvas__asset-row"
                  draggable
                  key={pattern.id}
                  onDragStart={(event) =>
                    handleAssetDragStart(
                      {
                        name: pattern.name,
                        src,
                        sourcePattern: patternToCanvasReference(pattern),
                      },
                      event,
                    )
                  }
                >
                  <img src={src} alt={pattern.name} />
                  <div>
                    <strong>{pattern.name}</strong>
                    <span>{pattern.dynasty || '未标注朝代'}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {!leftCollapsed && (
          <button
            className="super-canvas__resize super-canvas__resize--left"
            type="button"
            aria-label="调整左侧面板宽度"
            onPointerDown={startPanelResize('left')}
          />
        )}
      </FloatingCanvasPanel>

      <main className="super-canvas__workspace">
        <div className="super-canvas__toolbar" role="toolbar" aria-label="纹样转化画布工具栏">
          <button
            className={!isPanTool && tool === 'select' ? 'is-active' : ''}
            type="button"
            title="选择"
            onClick={() => setTool('select')}
          >
            <CursorIcon />
          </button>
          <button type="button" title="平移画布" aria-label="平移画布" aria-pressed={isPanTool}
            className={isPanTool ? 'is-active' : ''} onClick={() => { setCanvasTool('select'); setIsPanTool(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 12V5a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-4a1.5 1.5 0 0 1 3 0v7c0 4-3 7-7 7-3 0-5-2-7-5l-3-4a1.5 1.5 0 0 1 2-2l3 3" /></svg>
          </button>
          <button
            className={tool === 'brush' ? 'is-active' : ''}
            type="button"
            title="画笔"
            onClick={() => setTool('brush')}
          >
            <BrushIcon />
          </button>
          <button
            className={tool === 'eraser' ? 'is-active' : ''}
            type="button"
            title="橡皮擦"
            onClick={() => setTool('eraser')}
          >
            <ClearFormattingIcon />
          </button>
          <button
            className={tool === 'capture' ? 'is-active' : ''}
            type="button"
            title="截取"
            onClick={() => setTool('capture')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="3 3" /></svg>
          </button>
          <button
            type="button"
            title="上传"
            aria-label="导入图片"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageAddIcon />
          </button>
          <button
            className={isCropModeActive ? 'is-active' : ''}
            disabled={!selectedImageLayer}
            type="button"
            title="裁剪图片"
            onClick={toggleCropMode}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M7 2v15h15M2 7h15v15" /></svg>
          </button>
          <button type="button" title="删除" onClick={handleDeleteSelected}>
            <DeleteIcon />
          </button>
          <FavoriteButton key={selectedImageLayer ? JSON.stringify([selectedImageLayer.id, selectedImageLayer.crop, selectedImageLayer.flipX, selectedImageLayer.flipY, selectedImageLayer.rotation, selectedImageLayer.width, selectedImageLayer.height, selectedImageLayer.opacity]) : 'none'}
            projectId={_projectKey} name={selectedImageLayer?.name || '转化纹样'}
            disabled={!selectedImageLayer || !(selectedImageLayer.generated || selectedImageLayer.id.startsWith('ai-'))}
            getImage={() => exportFavorite(selectedImageLayer!)}
            provenance={selectedImageLayer ? provenanceOf(selectedImageLayer) : undefined}
            prompt={selectedImageLayer?.promptTrace?.originalPrompt} onStatus={setStatusMessage}
            onSaved={(asset) => {
              const layerId = selectedImageLayer?.id;
              if (layerId) setLayers(current => current.map(l => l.id === layerId && l.type === 'image' ? { ...l, name: asset.name || l.name, sourceAssetId: asset.id, savedTransformFingerprint: layerTransformFingerprint(selectedImageLayer!) } : l));
            }}/>

          <span className="super-canvas__toolbar-divider" />
          <button
            type="button"
            title="放大"
            onClick={() => setZoom((currentZoom) => clamp(currentZoom + 0.1, 0.25, 3))}
          >
            <ZoomInIcon />
          </button>
          <button
            type="button"
            title="缩小"
            onClick={() => setZoom((currentZoom) => clamp(currentZoom - 0.1, 0.25, 3))}
          >
            <ZoomOutIcon />
          </button>
          <span className="super-canvas__zoom">{Math.round(zoom * 100)}%</span>
          {(tool === 'brush' || tool === 'eraser') && (
            <div className="super-canvas__brush-controls">
              {tool === 'brush' && (
                <input
                  aria-label="画笔颜色"
                  type="color"
                  value={brushColor}
                  onChange={(event) => setBrushColor(event.target.value)}
                />
              )}
              <input
                aria-label={tool === 'brush' ? '画笔大小' : '橡皮擦大小'}
                max="28"
                min="2"
                type="range"
                value={brushSize}
                onChange={(event) => setBrushSize(Number(event.target.value))}
              />
            </div>
          )}
          <input
            accept="image/*"
            className="super-canvas__file-input"
            onChange={handleUpload}
            ref={fileInputRef}
            type="file"
          />
        </div>

        <div
          className={`super-canvas__stage ${
            tool === 'capture' ? 'is-capturing' : ''
          } ${tool === 'eraser' ? 'is-erasing' : ''} ${isPanTool ? 'is-panning' : ''}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onPointerCancel={handleStagePointerUp}
        >
          <div className="super-canvas__board" ref={stageRef} style={canvasStyle}>
            {layers.map((layer) => {
              if (layer.type === 'stroke') {
                return (
                  <svg
                    className="super-canvas__stroke-layer"
                    height={CANVAS_HEIGHT}
                    key={layer.id}
                    viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
                    width={CANVAS_WIDTH}
                  >
                    <polyline
                      fill="none"
                      points={layer.points.map((point) => `${point.x},${point.y}`).join(' ')}
                      stroke={layer.color}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={layer.size}
                    />
                  </svg>
                );
              }

              if (layer.type === 'generation-placeholder') {
                return (
                  <div
                    className={`super-canvas__generation-placeholder ${
                      selectedLayerIdSet.has(layer.id) ? 'is-selected' : ''
                    }`}
                    key={layer.id}
                    style={{
                      left: layer.x,
                      top: layer.y,
                      width: layer.width,
                      height: layer.height,
                      opacity: layer.opacity,
                    }}
                    title={layer.name}
                    aria-busy="true"
                    aria-label="图片生成中"
                  >
                    <div className="super-canvas__generation-spinner" aria-hidden="true" />
                    <strong>生成中</strong>
                    <span>{layer.prompt}</span>
                  </div>
                );
              }

              return (
                <div
                  className={`super-canvas__image-layer ${
                    selectedLayerIdSet.has(layer.id) ? 'is-selected' : ''
                  }`}
                  key={layer.id}
                  onPointerDown={(event) => handleLayerPointerDown(layer, event)}
                  onContextMenu={(event) => handleLayerContextMenu(layer, event)}
                  onDoubleClick={() => { selectLayers([layer.id]); setEditingLayerId(layer.id); }}
                  onWheel={(event) => handleWheelLayer(event, layer.id)}
                  style={{
                    left: layer.x,
                    top: layer.y,
                    width: layer.width,
                    height: layer.height,
                    opacity: layer.opacity,
                    transform: `rotate(${layer.rotation}deg)`,
                  }}
                  title={layer.name}
                >
                  <div className="super-canvas__image-layer-clip" style={{ transform: `scale(${layer.flipX ? -1 : 1}, ${layer.flipY ? -1 : 1})` }}>
                    <img
                      src={layer.src}
                      alt={layer.name}
                      draggable={false}
                      style={getCroppedImageStyle(layer)}
                    />
                  </div>
                  {selectedLayerIdSet.has(layer.id) &&
                    cropModeLayerId !== layer.id && (
                    <div className="super-canvas__transform-handles">
                      {TRANSFORM_CORNERS.map(([corner, label]) => (
                        <button
                          aria-label={`${label}旋转选中图层`}
                          className={`super-canvas__rotate-zone super-canvas__rotate-zone--${corner}`}
                          key={`rotate-${corner}`}
                          type="button"
                          onPointerDown={(event) =>
                            startDirectLayerTransform(layer, 'rotate', event)
                          }
                        />
                      ))}
                      {TRANSFORM_CORNERS.map(([corner, label]) => (
                        <button
                          aria-label={`${label}缩放选中图层`}
                          className={`super-canvas__resize-handle super-canvas__resize-handle--${corner}`}
                          key={`resize-${corner}`}
                          type="button"
                          onPointerDown={(event) =>
                            startDirectLayerTransform(layer, 'resize', event)
                          }
                        />
                      ))}
                    </div>
                  )}
                  {selectedLayerIdSet.has(layer.id) &&
                    cropModeLayerId === layer.id && (
                      <div className="super-canvas__crop-frame">
                        {CROP_FRAME_HANDLES.map(([handle, label]) => (
                          <button
                            aria-label={`${label}裁剪框`}
                            className={`super-canvas__crop-handle super-canvas__crop-handle--${handle}`}
                            key={handle}
                            type="button"
                            onPointerDown={(event) =>
                              startCropFrameTransform(layer, handle, event)
                            }
                          />
                        ))}
                        <span className="super-canvas__crop-size">
                          {Math.round(layer.width)} × {Math.round(layer.height)}
                        </span>
                      </div>
                    )}
                </div>
              );
            })}
            {captureRect && (
              <div
                className="super-canvas__capture-rect"
                style={{
                  left: captureRect.x,
                  top: captureRect.y,
                  width: captureRect.width,
                  height: captureRect.height,
                }}
              />
            )}
          </div>
        </div>

        {layerContextMenu && (
          <div
            className="super-canvas__context-menu"
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
            style={{ left: layerContextMenu.x, top: layerContextMenu.y }}
          >
            <button type="button" onClick={() => {
              setEditingLayerId(layerContextMenu.layerId);
              setLayerContextMenu(null);
            }}>编辑图片</button>
            <button type="button" onClick={() => { setTool('capture'); setLayerContextMenu(null); }}>截取区域</button>
            <button
              type="button"
              onClick={() => duplicateLayers([layerContextMenu.layerId])}
            >
              复制
            </button>
            <button
              disabled={contextLayerIndex >= layers.length - 1}
              type="button"
              onClick={() => reorderLayer(layerContextMenu.layerId, 'front')}
            >
              置于顶层
            </button>
            <button
              disabled={contextLayerIndex >= layers.length - 1}
              type="button"
              onClick={() => reorderLayer(layerContextMenu.layerId, 'forward')}
            >
              上移一层
            </button>
            <button
              disabled={contextLayerIndex <= 0}
              type="button"
              onClick={() => reorderLayer(layerContextMenu.layerId, 'backward')}
            >
              下移一层
            </button>
            <button
              disabled={contextLayerIndex <= 0}
              type="button"
              onClick={() => reorderLayer(layerContextMenu.layerId, 'back')}
            >
              置于底层
            </button>
            <button type="button" onClick={() => { handleDeleteSelected(); setLayerContextMenu(null); }}>删除</button>
          </div>
        )}

        <div className="super-canvas__generate-bar workspace-composer">
          <textarea
            rows={2}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !composingRef.current && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault();
                void handleGenerate();
              }
            }}
            aria-label="描述你的设计要求"
            placeholder="描述你想怎么修改…"
          />
          <div className="super-canvas__generate-actions">
            <button
              className="super-canvas__generate-button workspace-send"
              aria-label={isGenerating ? '转化中' : 'AI 转化'}
              title={isGenerating ? '转化中' : 'AI 转化'}
              disabled={isGenerating || !prompt.trim()}
              type="button"
              onClick={() => void handleGenerate()}
            >
              {isGenerating ? <span className="pattern-spinner"/> : <ArrowUpIcon size={22}/>}
              <span className="workspace-control-label">{isGenerating ? '转化中' : 'AI 转化'}</span>
            </button>
            {isGenerating && (
              <button
                className="super-canvas__cancel-generate-button"
                type="button"
                onClick={handleCancelGenerate}
              >
                取消生成
              </button>
            )}
          </div>
          <div className={`super-canvas__status ${isGenerating ? 'is-generating' : ''}`} role="status" aria-live="polite">
            {isGenerating && <span className="super-canvas__status-dot" aria-hidden="true" />}{statusMessage}
          </div>
          {!isGenerating && (selectedImageLayer?.promptTrace ?? completedTrace) && (
            <details className="super-canvas__prompt-details">
              <summary>提示词详情</summary>
              <div>
                <h3>原始需求</h3><p>{(selectedImageLayer?.promptTrace ?? completedTrace)?.originalPrompt}</p>
                <h3>优化后提示词</h3><p>{(selectedImageLayer?.promptTrace ?? completedTrace)?.optimizedPrompt}</p>
              </div>
            </details>
          )}
        </div>
      </main>

      {selectedImageLayer && editingLayerId === selectedImageLayer.id && (
        <div className="super-canvas__quick-edit" role="toolbar" aria-label="图片快捷编辑">
          <button type="button" onClick={toggleCropMode} aria-pressed={isCropModeActive}>裁剪</button>
          <button type="button" onClick={() => updateSelectedImageLayer(layer => rotateImageLayer(layer, layer.rotation + 90))}>旋转</button>
          <button type="button" aria-label="水平镜像" aria-pressed={!!selectedImageLayer.flipX}
            onClick={() => updateSelectedImageLayer(layer => ({ ...layer, flipX: !layer.flipX }))}>水平镜像</button>
          <button type="button" aria-label="垂直镜像" aria-pressed={!!selectedImageLayer.flipY}
            onClick={() => updateSelectedImageLayer(layer => ({ ...layer, flipY: !layer.flipY }))}>垂直镜像</button>
          <button type="button" onClick={handleDuplicateSelected}>复制</button>
          <button type="button" aria-label="关闭图片编辑" onClick={() => setEditingLayerId(null)}>×</button>
        </div>
      )}
      <FloatingCanvasPanel key={`${_projectKey}-captures`} title="参考图" side="right" count={captures.length}
        width={rightWidth} collapsed={rightCollapsed} onToggle={() => setRightCollapsed(value => !value)}>
          <div className="super-canvas__right-content">
            <div className="super-canvas__capture-list">
            {captures.length === 0 && (
              <p className="super-canvas__empty">暂无截取素材</p>
            )}
            {captures.map((capture) => (
              <article
                className="super-canvas__capture-row"
                draggable
                key={capture.id}
                onDragStart={(event) =>
                  handleAssetDragStart(
                    { name: capture.name, src: capture.src, captureId: capture.id },
                    event,
                  )
                }
              >
                <img src={capture.src} alt={capture.name} />
                <FavoriteButton projectId={_projectKey} name={capture.name} provenance={capture.provenance} getImage={async()=>capture.src} onStatus={setStatusMessage} onSaved={asset => { if (asset.name) setCaptures(current => current.map(c => c.id === capture.id ? { ...c, name: asset.name, sourceAssetId: asset.id } : c)); }}/>

                <button
                  className="super-canvas__capture-delete"
                  type="button"
                  title="删除截取素材"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteCapture(capture.id);
                  }}
                  onDragStart={(event) => event.preventDefault()}
                >
                  <DeleteIcon />
                </button>
                <button
                  className="super-canvas__capture-add"
                  type="button"
                  title="添加到画布"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleAddCaptureToCanvas(capture);
                  }}
                  onDragStart={(event) => event.preventDefault()}
                >
                  <ImageAddIcon />
                </button>
              </article>
            ))}
            </div>
          </div>
        {!rightCollapsed && (
          <button
            className="super-canvas__resize super-canvas__resize--right"
            type="button"
            aria-label="调整右侧面板宽度"
            onPointerDown={startPanelResize('right')}
          />
        )}
      </FloatingCanvasPanel>
    </div>
  );
}
