import type { PatternProvenance } from '../assets/provenance';
export type CanvasPoint = {
  x: number;
  y: number;
};

export type ImageLayer = {
  id: string;
  type: 'image';
  name: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  crop?: ImageCrop;
  flipX?: boolean;
  flipY?: boolean;
  sourcePattern?: CanvasPatternReference;
  generated?: boolean;
  promptTrace?: GenerationResponse['promptTrace'];
  provenance?: PatternProvenance;
  sourceAssetId?: string;
  savedTransformFingerprint?: string;
  savedAssetTransformFingerprint?: string;
  referenceKind?: 'original' | 'generated' | 'capture' | 'derived';
};

export type ImageCrop = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type GenerationPlaceholderLayer = {
  id: string;
  type: 'generation-placeholder';
  name: string;
  prompt: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
};

export type StrokeLayer = {
  id: string;
  type: 'stroke';
  color: string;
  size: number;
  points: CanvasPoint[];
};

export type CanvasLayer = ImageLayer | StrokeLayer | GenerationPlaceholderLayer;

export type CanvasTool = 'select' | 'brush' | 'eraser' | 'capture';

export type CaptureItem = {
  sourceAssetId?: string;
  provenance?: PatternProvenance;
  id: string;
  name: string;
  src: string;
  createdAt: string;
};

export type GenerationResponse = {
  imageUrl: string;
  taskId: string;
  confidence: 'high' | 'low';
  transparentPixelRatio: number;
  promptTrace?: { originalPrompt: string; optimizedPrompt: string; mode: string };
};

export type CanvasPatternReference = {
  id: string;
  name: string;
  imageUrl: string;
  dynasty?: string;
  description?: string;
  carriers?: string[];
  materials?: string[];
  motifs?: string[];
  layouts?: string[];
};

export type PromptTagCategory =
  | 'carrier'
  | 'color'
  | 'detail'
  | 'generation'
  | 'layout'
  | 'lineStyle'
  | 'material'
  | 'motif'
  | 'scene'
  | 'style';

export type PromptTag = {
  id: string;
  category: PromptTagCategory;
  label: string;
};

export type SavedPromptAsset = {
  id: string;
  title: string;
  promptText: string;
  tags: PromptTag[];
  sourcePatterns: CanvasPatternReference[];
  generatedImageUrl?: string;
  quality: 'recommended' | 'normal';
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
};

export type PromptRecommendation = {
  asset: SavedPromptAsset;
  score: number;
  reasons: string[];
  matchedTags: PromptTag[];
};
