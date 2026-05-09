import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react';
import {
  AiImageIcon,
  BrushIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CutIcon,
  DeleteIcon,
  UploadIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'tdesign-icons-react';
import { useImageSearch } from '../../context/ImageSearchContext';
import { createImageLayer, resolveDropPoint, scaleImageLayer } from './layerMath';
import { exportLayersToPng } from './renderCanvas';
import { generateTransparentAsset } from './superCanvasApi';
import { resolveBackendImageUrl } from './imageUrls';
import type { CanvasLayer, CanvasTool, CaptureItem, ImageLayer } from './types';
import './SuperCanvasPage.css';

const ASSET_TRANSFER_KEY = 'application/x-super-canvas-asset';
const CANVAS_WIDTH = 1440;
const CANVAS_HEIGHT = 820;
const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 420;
const MIN_CAPTURE_SIZE = 8;

type DragAsset = {
  name: string;
  src: string;
};

type DragState = {
  layerId: string;
  startPoint: { x: number; y: number };
  startLayer: ImageLayer;
};

type CaptureDraft = {
  start: { x: number; y: number };
  current: { x: number; y: number };
};

const createId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

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

export default function SuperCanvasPage() {
  const { selectedPatterns } = useImageSearch();
  const [layers, setLayers] = useState<CanvasLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [zoom, setZoom] = useState(1);
  const [pan] = useState({ x: 0, y: 0 });
  const [brushColor, setBrushColor] = useState('#1f2937');
  const [brushSize, setBrushSize] = useState(8);
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('可拖入左侧纹样开始编辑');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(300);
  const [captureDraft, setCaptureDraft] = useState<CaptureDraft | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const activeStrokeIdRef = useRef<string | null>(null);

  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [layers, selectedLayerId],
  );

  const selectedImageLayer =
    selectedLayer?.type === 'image' ? selectedLayer : null;

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
      });

      setLayers((currentLayers) => [...currentLayers, layer]);
      setSelectedLayerId(layer.id);
      setStatusMessage(`已添加 ${asset.name}`);
    },
    [],
  );

  const moveSelected = useCallback((deltaX: number, deltaY: number) => {
    setLayers((currentLayers) =>
      currentLayers.map((layer) =>
        layer.id === selectedLayerId && layer.type === 'image'
          ? { ...layer, x: layer.x + deltaX, y: layer.y + deltaY }
          : layer,
      ),
    );
  }, [selectedLayerId]);

  const scaleSelectedLayer = useCallback((scale: number) => {
    setLayers((currentLayers) =>
      currentLayers.map((layer) =>
        layer.id === selectedLayerId && layer.type === 'image'
          ? scaleImageLayer(layer, scale)
          : layer,
      ),
    );
  }, [selectedLayerId]);

  const startPanelResize = useCallback(
    (side: 'left' | 'right') => (event: ReactPointerEvent<HTMLButtonElement>) => {
      const startX = event.clientX;
      const startWidth = side === 'left' ? leftWidth : rightWidth;

      event.currentTarget.setPointerCapture(event.pointerId);

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

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
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
      const asset = JSON.parse(serializedAsset) as DragAsset;
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
    if (!selectedLayerId) {
      return;
    }

    setLayers((currentLayers) =>
      currentLayers.filter((layer) => layer.id !== selectedLayerId),
    );
    setSelectedLayerId(null);
    setStatusMessage('已删除选中图层');
  }, [selectedLayerId]);

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
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
      setSelectedLayerId(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === 'capture') {
      setCaptureDraft({ start: point, current: point });
      setSelectedLayerId(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    setSelectedLayerId(null);
  };

  const handleLayerPointerDown = (
    layer: ImageLayer,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (tool !== 'select' || event.button !== 0) {
      return;
    }

    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    event.stopPropagation();
    setSelectedLayerId(layer.id);
    dragStateRef.current = {
      layerId: layer.id,
      startPoint: point,
      startLayer: layer,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    const dragState = dragStateRef.current;

    if (dragState) {
      const deltaX = point.x - dragState.startPoint.x;
      const deltaY = point.y - dragState.startPoint.y;

      setLayers((currentLayers) =>
        currentLayers.map((layer) =>
          layer.id === dragState.layerId && layer.type === 'image'
            ? {
                ...layer,
                x: dragState.startLayer.x + deltaX,
                y: dragState.startLayer.y + deltaY,
              }
            : layer,
        ),
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
      };

      setCaptures((currentCaptures) => [capture, ...currentCaptures]);
      setStatusMessage('已保存截取素材');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '截取失败');
    }
  }, [captureDraft, captures.length, layers]);

  const handleStagePointerUp = () => {
    dragStateRef.current = null;
    activeStrokeIdRef.current = null;
    void finishCapture();
  };

  const handleWheelLayer = (
    event: WheelEvent<HTMLDivElement>,
    layerId: string,
  ) => {
    if (layerId !== selectedLayerId) {
      return;
    }

    event.preventDefault();
    scaleSelectedLayer(event.deltaY < 0 ? 1.08 : 0.92);
  };

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setStatusMessage('正在调用即梦 4.0 生成图片...');

    try {
      const result = await generateTransparentAsset({
        prompt: trimmedPrompt,
        referenceImageUrl: selectedImageLayer?.src,
      });
      const src = resolveBackendImageUrl(result.imageUrl);
      const image = await loadImage(src);
      const layer = createImageLayer({
        id: createId('ai'),
        name: 'AI 生成纹样',
        src,
        dropPoint: { x: 720, y: 380 },
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      });

      setLayers((currentLayers) => [...currentLayers, layer]);
      setSelectedLayerId(layer.id);
      setStatusMessage(
        result.confidence === 'high'
          ? '已生成透明底 PNG'
          : '已生成 PNG，透明化效果可能不完整',
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

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
  }, [handleDeleteSelected, moveSelected, scaleSelectedLayer]);

  const captureRect = captureDraft ? normalizeRect(captureDraft) : null;
  const canvasStyle: CSSProperties = {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
  };

  return (
    <div className="super-canvas">
      <aside
        className={`super-canvas__panel super-canvas__panel--left ${
          leftCollapsed ? 'is-collapsed' : ''
        }`}
        style={{ width: leftCollapsed ? 52 : leftWidth }}
      >
        <div className="super-canvas__panel-header">
          {!leftCollapsed && <h2>已选纹样</h2>}
          <button
            className="super-canvas__collapse-button"
            type="button"
            title={leftCollapsed ? '展开左侧面板' : '收起左侧面板'}
            onClick={() => setLeftCollapsed((collapsed) => !collapsed)}
          >
            {leftCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        </div>
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
                    handleAssetDragStart({ name: pattern.name, src }, event)
                  }
                >
                  <img src={src} alt={pattern.name} />
                  <div>
                    <strong>{pattern.name}</strong>
                    <span>{pattern.dynasty || '未标注朝代'}</span>
                    <p>{pattern.description}</p>
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
      </aside>

      <main className="super-canvas__workspace">
        <div className="super-canvas__toolbar" aria-label="超级画布工具栏">
          <button
            className={tool === 'select' ? 'is-active' : ''}
            type="button"
            title="选择"
            onClick={() => setTool('select')}
          >
            <AiImageIcon />
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
            className={tool === 'capture' ? 'is-active' : ''}
            type="button"
            title="截取"
            onClick={() => setTool('capture')}
          >
            <CutIcon />
          </button>
          <button
            type="button"
            title="上传"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon />
          </button>
          <button type="button" title="删除" onClick={handleDeleteSelected}>
            <DeleteIcon />
          </button>
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
          {tool === 'brush' && (
            <div className="super-canvas__brush-controls">
              <input
                aria-label="画笔颜色"
                type="color"
                value={brushColor}
                onChange={(event) => setBrushColor(event.target.value)}
              />
              <input
                aria-label="画笔大小"
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
          className={`super-canvas__stage ${tool === 'capture' ? 'is-capturing' : ''}`}
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

              return (
                <div
                  className={`super-canvas__image-layer ${
                    selectedLayerId === layer.id ? 'is-selected' : ''
                  }`}
                  key={layer.id}
                  onPointerDown={(event) => handleLayerPointerDown(layer, event)}
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
                  <img src={layer.src} alt={layer.name} draggable={false} />
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

        <div className="super-canvas__generate-bar">
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleGenerate();
              }
            }}
            placeholder="输入生成提示词"
          />
          <button
            className="super-canvas__generate-button"
            disabled={isGenerating}
            type="button"
            onClick={() => void handleGenerate()}
          >
            {isGenerating ? '生成中' : 'AI 生成'}
          </button>
          <span className="super-canvas__status">{statusMessage}</span>
        </div>
      </main>

      <aside
        className={`super-canvas__panel super-canvas__panel--right ${
          rightCollapsed ? 'is-collapsed' : ''
        }`}
        style={{ width: rightCollapsed ? 52 : rightWidth }}
      >
        <div className="super-canvas__panel-header">
          <button
            className="super-canvas__collapse-button"
            type="button"
            title={rightCollapsed ? '展开右侧面板' : '收起右侧面板'}
            onClick={() => setRightCollapsed((collapsed) => !collapsed)}
          >
            {rightCollapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}
          </button>
          {!rightCollapsed && <h2>截取素材</h2>}
        </div>
        {!rightCollapsed && (
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
                    { name: capture.name, src: capture.src },
                    event,
                  )
                }
              >
                <img src={capture.src} alt={capture.name} />
                <div>
                  <strong>{capture.name}</strong>
                  <span>
                    {new Date(capture.createdAt).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
        {!rightCollapsed && (
          <button
            className="super-canvas__resize super-canvas__resize--right"
            type="button"
            aria-label="调整右侧面板宽度"
            onPointerDown={startPanelResize('right')}
          />
        )}
      </aside>
    </div>
  );
}
