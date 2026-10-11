import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type {
  CanvasLayer,
  CanvasTool,
  CaptureItem,
  SavedPromptAsset,
} from '../components/superCanvas/types';

/* eslint-disable react-refresh/only-export-components */

interface SuperCanvasContextType {
  layers: CanvasLayer[];
  setLayers: Dispatch<SetStateAction<CanvasLayer[]>>;
  selectedLayerId: string | null;
  setSelectedLayerId: Dispatch<SetStateAction<string | null>>;
  selectedLayerIds: string[];
  setSelectedLayerIds: Dispatch<SetStateAction<string[]>>;
  tool: CanvasTool;
  setTool: Dispatch<SetStateAction<CanvasTool>>;
  zoom: number;
  setZoom: Dispatch<SetStateAction<number>>;
  brushColor: string;
  setBrushColor: Dispatch<SetStateAction<string>>;
  brushSize: number;
  setBrushSize: Dispatch<SetStateAction<number>>;
  captures: CaptureItem[];
  setCaptures: Dispatch<SetStateAction<CaptureItem[]>>;
  promptAssets: SavedPromptAsset[];
  setPromptAssets: Dispatch<SetStateAction<SavedPromptAsset[]>>;
  prompt: string;
  setPrompt: Dispatch<SetStateAction<string>>;
  isGenerating: boolean;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  statusMessage: string;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  leftCollapsed: boolean;
  setLeftCollapsed: Dispatch<SetStateAction<boolean>>;
  rightCollapsed: boolean;
  setRightCollapsed: Dispatch<SetStateAction<boolean>>;
  leftWidth: number;
  setLeftWidth: Dispatch<SetStateAction<number>>;
  rightWidth: number;
  setRightWidth: Dispatch<SetStateAction<number>>;
}

const SuperCanvasContext = createContext<SuperCanvasContextType | undefined>(undefined);

export function SuperCanvasProvider({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<CanvasLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [zoom, setZoom] = useState(1);
  const [brushColor, setBrushColor] = useState('#1f2937');
  const [brushSize, setBrushSize] = useState(8);
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [promptAssets, setPromptAssets] = useState<SavedPromptAsset[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('可拖入左侧纹样开始转化');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(300);

  return (
    <SuperCanvasContext.Provider
      value={{
        layers,
        setLayers,
        selectedLayerId,
        setSelectedLayerId,
        selectedLayerIds,
        setSelectedLayerIds,
        tool,
        setTool,
        zoom,
        setZoom,
        brushColor,
        setBrushColor,
        brushSize,
        setBrushSize,
        captures,
        setCaptures,
        promptAssets,
        setPromptAssets,
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
      }}
    >
      {children}
    </SuperCanvasContext.Provider>
  );
}

export function useSuperCanvas() {
  const context = useContext(SuperCanvasContext);
  if (!context) {
    throw new Error('useSuperCanvas must be used within a SuperCanvasProvider');
  }
  return context;
}
