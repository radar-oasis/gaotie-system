import type { CaseChatMessage, CaseReference } from '../context/CaseSearchContext';
import { emptyStudio, normalizeStudio, type ColorStudioState } from '../components/colorConfig/colorStudio';
import type { ChatMessage, Tag } from '../context/ChatContext';
import type {
  ColorRegion,
  ColorScheme,
  ExtractedPaletteGroup,
  LayoutScheme,
} from '../context/ColorConfigContext';
import type { ConfirmedTag } from '../context/SharedTagsContext';
import type { IntentFilter, Pattern, PatternSearchGroup, SearchGroupInput } from '../context/ImageSearchContext';
import type {
  AdjustmentHistoryItem,
  GeneratedProposal,
} from '../components/finalProposal/finalProposalTypes';
import type {
  CanvasLayer,
  CanvasTool,
  CaptureItem,
  SavedPromptAsset,
} from '../components/superCanvas/types';

export type WorkspaceTab =
  | 'demand'
  | 'image'
  | 'layout'
  | 'color'
  | 'canvas'
  | 'case'
  | 'proposal'
  | 'assets';

export interface WorkspaceSnapshot {
  version: 1;
  activeTab: WorkspaceTab;
  demand: {
    chatHistory: ChatMessage[];
    selectedTags: Tag[];
  };
  sharedTags: {
    confirmedTags: ConfirmedTag[];
  };
  image: {
    patterns: Pattern[];
    searchGroups: PatternSearchGroup[];
    selectedPatterns: Pattern[];
    intentFilters: IntentFilter;
    reasoning: string;
    searchMessage: string;
    autoSearchKey: string;
    searchInput: string;
  };
  caseSearch: {
    chatHistory: CaseChatMessage[];
    selectedCases: CaseReference[];
  };
  colorConfig: {
    studio: ColorStudioState;
    selectedLayoutScheme: LayoutScheme | null;
    colorRegions: ColorRegion[];
    selectedRegionId: string | null;
    currentColorScheme: ColorScheme | null;
    savedSchemes: ColorScheme[];
    extractedPalette: string[];
    paletteGroups: ExtractedPaletteGroup[];
    uploadedImage: string | null;
    selectedPaletteColor: string | null;
  };
  canvas: {
    layers: CanvasLayer[];
    selectedLayerId: string | null;
    tool: CanvasTool;
    zoom: number;
    brushColor: string;
    brushSize: number;
    captures: CaptureItem[];
    promptAssets: SavedPromptAsset[];
    prompt: string;
    statusMessage: string;
    leftCollapsed: boolean;
    rightCollapsed: boolean;
    leftWidth: number;
    rightWidth: number;
  };
  finalProposal: {
    selectedReferenceAssetIds: string[] | null;
    selectedReferenceImageUrls: string[];
    currentProposal: GeneratedProposal | null;
    archivedProposals: GeneratedProposal[];
    adjustmentHistory: AdjustmentHistoryItem[];
    selectedCompareIds: string[];
  };
  savedAt?: string;
}

const VALID_TABS: WorkspaceTab[] = [
  'demand',
  'image',
  'layout',
  'color',
  'canvas',
  'case',
  'proposal',
  'assets',
];

const emptyIntentFilters = (): IntentFilter => ({
  motifs: [],
  dynasties: [],
  materials: [],
  others: [],
});

export function createEmptyWorkspaceSnapshot(): WorkspaceSnapshot {
  return {
    version: 1,
    activeTab: 'demand',
    demand: {
      chatHistory: [],
      selectedTags: [],
    },
    sharedTags: {
      confirmedTags: [],
    },
    image: {
      patterns: [],
      searchGroups: [],
      selectedPatterns: [],
      intentFilters: emptyIntentFilters(),
      reasoning: '',
      searchMessage: '',
      autoSearchKey: '',
      searchInput: '',
    },
    caseSearch: {
      chatHistory: [],
      selectedCases: [],
    },
    colorConfig: {
      studio: emptyStudio(),
      selectedLayoutScheme: null,
      colorRegions: [],
      selectedRegionId: null,
      currentColorScheme: null,
      savedSchemes: [],
      extractedPalette: [],
      paletteGroups: [],
      uploadedImage: null,
      selectedPaletteColor: null,
    },
    canvas: {
      layers: [],
      selectedLayerId: null,
      tool: 'select',
      zoom: 1,
      brushColor: '#1f2937',
      brushSize: 8,
      captures: [],
      promptAssets: [],
      prompt: '',
      statusMessage: '可拖入左侧纹样开始转化',
      leftCollapsed: false,
      rightCollapsed: false,
      leftWidth: 300,
      rightWidth: 300,
    },
    finalProposal: {
      selectedReferenceAssetIds: [],
      selectedReferenceImageUrls: [],
      currentProposal: null,
      archivedProposals: [],
      adjustmentHistory: [],
      selectedCompareIds: [],
    },
  };
}

export function normalizeWorkspaceSnapshot(value: unknown): WorkspaceSnapshot {
  const base = createEmptyWorkspaceSnapshot();

  if (!isRecord(value)) {
    return base;
  }

  const demand = recordOrEmpty(value.demand);
  const sharedTags = recordOrEmpty(value.sharedTags);
  const image = recordOrEmpty(value.image);
  const caseSearch = recordOrEmpty(value.caseSearch);
  const colorConfig = recordOrEmpty(value.colorConfig);
  const canvas = recordOrEmpty(value.canvas);
  const finalProposal = recordOrEmpty(value.finalProposal);

  return {
    ...base,
    activeTab: isWorkspaceTab(value.activeTab) ? value.activeTab : base.activeTab,
    demand: {
      chatHistory: arrayOrEmpty<ChatMessage>(demand.chatHistory),
      selectedTags: arrayOrEmpty<Tag>(demand.selectedTags),
    },
    sharedTags: {
      confirmedTags: arrayOrEmpty<ConfirmedTag>(sharedTags.confirmedTags),
    },
    image: {
      patterns: arrayOrEmpty<Pattern>(image.patterns),
      searchGroups: arrayOrEmpty<PatternSearchGroup>(image.searchGroups),
      selectedPatterns: arrayOrEmpty<Pattern>(image.selectedPatterns),
      intentFilters: normalizeIntentFilters(image.intentFilters),
      reasoning: stringOrEmpty(image.reasoning),
      searchMessage: stringOrEmpty(image.searchMessage),
      autoSearchKey: stringOrEmpty(image.autoSearchKey),
      searchInput: stringOrDefault(image.searchInput, stringOrEmpty(image.autoSearchKey)),
    },
    caseSearch: {
      chatHistory: arrayOrEmpty<CaseChatMessage>(caseSearch.chatHistory),
      selectedCases: arrayOrEmpty<CaseReference>(caseSearch.selectedCases),
    },
    colorConfig: {
      studio: normalizeStudio(colorConfig.studio),
      selectedLayoutScheme: nullableObject<LayoutScheme>(
        colorConfig.selectedLayoutScheme,
      ),
      colorRegions: arrayOrEmpty<ColorRegion>(colorConfig.colorRegions),
      selectedRegionId: nullableString(colorConfig.selectedRegionId),
      currentColorScheme: nullableObject<ColorScheme>(
        colorConfig.currentColorScheme,
      ),
      savedSchemes: arrayOrEmpty<ColorScheme>(colorConfig.savedSchemes),
      extractedPalette: arrayOrEmpty<string>(colorConfig.extractedPalette),
      paletteGroups: arrayOrEmpty<ExtractedPaletteGroup>(
        colorConfig.paletteGroups,
      ),
      uploadedImage: nullableString(colorConfig.uploadedImage),
      selectedPaletteColor: nullableString(colorConfig.selectedPaletteColor),
    },
    canvas: {
      layers: arrayOrEmpty<CanvasLayer>(canvas.layers),
      selectedLayerId: nullableString(canvas.selectedLayerId),
      tool: isCanvasTool(canvas.tool) ? canvas.tool : base.canvas.tool,
      zoom: numberOrDefault(canvas.zoom, base.canvas.zoom),
      brushColor: stringOrDefault(canvas.brushColor, base.canvas.brushColor),
      brushSize: numberOrDefault(canvas.brushSize, base.canvas.brushSize),
      captures: arrayOrEmpty<CaptureItem>(canvas.captures),
      promptAssets: arrayOrEmpty<SavedPromptAsset>(canvas.promptAssets),
      prompt: stringOrEmpty(canvas.prompt),
      statusMessage: stringOrDefault(
        canvas.statusMessage,
        base.canvas.statusMessage,
      ),
      leftCollapsed: booleanOrDefault(
        canvas.leftCollapsed,
        base.canvas.leftCollapsed,
      ),
      rightCollapsed: booleanOrDefault(
        canvas.rightCollapsed,
        base.canvas.rightCollapsed,
      ),
      leftWidth: numberOrDefault(canvas.leftWidth, base.canvas.leftWidth),
      rightWidth: numberOrDefault(canvas.rightWidth, base.canvas.rightWidth),
    },
    finalProposal: {
      currentProposal: nullableObject<GeneratedProposal>(
        finalProposal.currentProposal,
      ),
      selectedReferenceAssetIds: Array.isArray(finalProposal.selectedReferenceAssetIds)
        ? finalProposal.selectedReferenceAssetIds.filter((id): id is string => typeof id === 'string')
        : null,
      // The archive index is server-owned and must never leak between project snapshots.
      archivedProposals: [],
      selectedReferenceImageUrls: arrayOrEmpty<string>(
        Array.isArray(finalProposal.selectedReferenceImageUrls)
          ? finalProposal.selectedReferenceImageUrls
          : recordOrEmpty(recordOrEmpty(finalProposal.currentProposal).packageSnapshot).selectedReferenceImageUrls,
      ).filter((url) => typeof url === 'string'),
      adjustmentHistory: arrayOrEmpty<AdjustmentHistoryItem>(
        finalProposal.adjustmentHistory,
      ),
      selectedCompareIds: arrayOrEmpty<string>(
        finalProposal.selectedCompareIds,
      ),
    },
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : undefined,
  };
}

function normalizeIntentFilters(value: unknown): IntentFilter {
  const source = recordOrEmpty(value);

  return {
    motifs: arrayOrEmpty<string>(source.motifs),
    dynasties: arrayOrEmpty<string>(source.dynasties),
    materials: arrayOrEmpty<string>(source.materials),
    others: arrayOrEmpty<string>(source.others),
    carriers: arrayOrEmpty<string>(source.carriers),
    layouts: arrayOrEmpty<string>(source.layouts),
    groups: arrayOrEmpty<SearchGroupInput>(source.groups),
  };
}

function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  return typeof value === 'string' && VALID_TABS.includes(value as WorkspaceTab);
}

function isCanvasTool(value: unknown): value is CanvasTool {
  return (
    value === 'select' ||
    value === 'brush' ||
    value === 'eraser' ||
    value === 'capture'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nullableObject<T>(value: unknown): T | null {
  return isRecord(value) ? (value as T) : null;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
