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
  naturalWidth: number;
  naturalHeight: number;
};

export type StrokeLayer = {
  id: string;
  type: 'stroke';
  name: string;
  points: CanvasPoint[];
  color: string;
  size: number;
};

export type CanvasLayer = ImageLayer | StrokeLayer;

export type CanvasTool = 'select' | 'pan' | 'brush' | 'eraser' | 'image';

export type CaptureItem = {
  id: string;
  name: string;
  imageUrl: string;
  thumbnailUrl?: string;
};

export type GenerationResponse = {
  imageUrl: string;
  prompt?: string;
  captures?: CaptureItem[];
};
