export interface ColorRegionDto {
  id: string;
  name: string;
  color: string;
  colorName?: string;
  description?: string;
  source?: 'manual' | 'palette' | 'image';
}

export interface SaveColorSchemeDto {
  name: string;
  layoutSchemeId: string;
  projectId?: string;
  layoutComponentsMap?: Record<string, string>;
  regions: ColorRegionDto[];
  palette?: string[];
}

export interface ColorSchemeResponse {
  id: string;
  name: string;
  layoutSchemeId: string;
  projectId?: string | null;
  layoutComponentsMap?: Record<string, string>;
  regions: ColorRegionDto[];
  palette: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface PaletteGroup {
  type: 'analogous' | 'contrast' | 'complementary' | 'monochrome' | 'semantic';
  title: string;
  colors: string[];
}

export interface ExtractPaletteResponse {
  status: 'success';
  basePalette: string[];
  groups: PaletteGroup[];
}

export interface ColorRgb {
  r: number;
  g: number;
  b: number;
}

export interface ColorHsl {
  h: number;
  s: number;
  l: number;
}
