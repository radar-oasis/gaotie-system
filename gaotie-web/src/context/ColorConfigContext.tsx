import { createContext, useContext, useState, useCallback, useRef, type ReactNode, type Dispatch, type SetStateAction, type RefObject } from 'react';
import { emptyStudio, type ColorStudioState, type StudioColor } from '../components/colorConfig/colorStudio';
import type { Layout3DData } from '../components/layout3d/layout3d';

/* eslint-disable react-refresh/only-export-components */

export interface ColorRegion {
  id: string;
  name: string;
  color: string;
  colorName?: string;
  description?: string;
  source?: 'manual' | 'palette' | 'image';
  category?: string;
  componentId?: string;
  layoutElementImageUrl?: string;
}

export interface ColorScheme {
  mode?: 'reference';
  colorRoles?: StudioColor[];
  rationale?: string;
  id: string;
  name: string;
  layoutSchemeId: string;
  projectId?: string | null;
  layoutComponentsMap?: Record<string, string>;
  regions: ColorRegion[];
  palette?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface ExtractedPaletteGroup {
  type: 'analogous' | 'contrast' | 'complementary' | 'monochrome' | 'semantic';
  title: string;
  colors: string[];
}

export interface LayoutScheme {
  id: string;
  name: string;
  componentsMap: Record<string, string>;
  layout3d?: Layout3DData;
  projectId?: string | null;
  createdAt?: string;
}

interface ColorConfigContextType {
  studio: ColorStudioState;
  setStudio: Dispatch<SetStateAction<ColorStudioState>>;
  studioRequestRef: RefObject<AbortController | null>;
  studioReadyProjectId: string | null;
  setStudioReadyProjectId: Dispatch<SetStateAction<string | null>>;
  selectedLayoutScheme: LayoutScheme | null;
  setSelectedLayoutScheme: (scheme: LayoutScheme | null) => void;
  colorRegions: ColorRegion[];
  setColorRegions: (regions: ColorRegion[]) => void;
  updateRegion: (regionId: string, updates: Partial<ColorRegion>) => void;
  addRegion: (region: ColorRegion) => void;
  removeRegion: (regionId: string) => void;
  selectedRegionId: string | null;
  setSelectedRegionId: (id: string | null) => void;
  currentColorScheme: ColorScheme | null;
  setCurrentColorScheme: (scheme: ColorScheme | null) => void;
  savedSchemes: ColorScheme[];
  setSavedSchemes: (schemes: ColorScheme[]) => void;
  extractedPalette: string[];
  setExtractedPalette: (palette: string[]) => void;
  paletteGroups: ExtractedPaletteGroup[];
  setPaletteGroups: (groups: ExtractedPaletteGroup[]) => void;
  uploadedImage: string | null;
  setUploadedImage: (image: string | null) => void;
  selectedPaletteColor: string | null;
  setSelectedPaletteColor: (color: string | null) => void;
}

const ColorConfigContext = createContext<ColorConfigContextType | undefined>(undefined);

export function ColorConfigProvider({ children }: { children: ReactNode }) {
  const [studio, setStudio] = useState(emptyStudio);
  const studioRequestRef = useRef<AbortController | null>(null);
  const [studioReadyProjectId, setStudioReadyProjectId] = useState<string | null>(null);
  const [selectedLayoutScheme, setSelectedLayoutScheme] = useState<LayoutScheme | null>(null);
  const [colorRegions, setColorRegions] = useState<ColorRegion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [currentColorScheme, setCurrentColorScheme] = useState<ColorScheme | null>(null);
  const [savedSchemes, setSavedSchemes] = useState<ColorScheme[]>([]);
  const [extractedPalette, setExtractedPalette] = useState<string[]>([]);
  const [paletteGroups, setPaletteGroups] = useState<ExtractedPaletteGroup[]>([]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedPaletteColor, setSelectedPaletteColor] = useState<string | null>(null);

  const updateRegion = useCallback((regionId: string, updates: Partial<ColorRegion>) => {
    setColorRegions(prev =>
      prev.map(region =>
        region.id === regionId ? { ...region, ...updates } : region
      )
    );
  }, []);

  const addRegion = useCallback((region: ColorRegion) => {
    setColorRegions(prev => [...prev, region]);
  }, []);

  const removeRegion = useCallback((regionId: string) => {
    setColorRegions(prev => prev.filter(region => region.id !== regionId));
    if (selectedRegionId === regionId) {
      setSelectedRegionId(null);
    }
  }, [selectedRegionId]);

  return (
    <ColorConfigContext.Provider
      value={{
        studio, setStudio, studioRequestRef, studioReadyProjectId, setStudioReadyProjectId,
        selectedLayoutScheme,
        setSelectedLayoutScheme,
        colorRegions,
        setColorRegions,
        updateRegion,
        addRegion,
        removeRegion,
        selectedRegionId,
        setSelectedRegionId,
        currentColorScheme,
        setCurrentColorScheme,
        savedSchemes,
        setSavedSchemes,
        extractedPalette,
        setExtractedPalette,
        paletteGroups,
        setPaletteGroups,
        uploadedImage,
        setUploadedImage,
        selectedPaletteColor,
        setSelectedPaletteColor,
      }}
    >
      {children}
    </ColorConfigContext.Provider>
  );
}

export function useColorConfig() {
  const context = useContext(ColorConfigContext);
  if (context === undefined) {
    throw new Error('useColorConfig must be used within a ColorConfigProvider');
  }
  return context;
}
