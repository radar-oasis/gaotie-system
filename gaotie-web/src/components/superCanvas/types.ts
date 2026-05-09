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
};

export type StrokeLayer = {
  id: string;
  type: 'stroke';
  color: string;
  size: number;
  points: CanvasPoint[];
};

export type CanvasLayer = ImageLayer | StrokeLayer;

export type CanvasTool = 'select' | 'brush' | 'capture';

export type CaptureItem = {
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
};
