import type { PatternProvenance } from '../assets/provenance';
import type { CaseReference } from "../../context/CaseSearchContext";
import type {
  ColorScheme,
  LayoutScheme,
} from "../../context/ColorConfigContext";
import type { Pattern } from "../../context/ImageSearchContext";
import type { ConfirmedTag } from "../../context/SharedTagsContext";

export interface EditRegion { x: number; y: number; width: number; height: number }

export interface FinalCanvasAsset {
  referenceKind?: 'original' | 'generated' | 'capture' | 'derived';
  sourcePatternId?: string;
  transformFingerprint?: string;
  sourceAssetId?: string;
  provenance?: PatternProvenance;
  id: string;
  name: string;
  imageUrl: string;
  source: "capture" | "layer";
}

export interface FinalDesignPackage {
  selectedReferenceAssetIds?: string[];
  demandTags: ConfirmedTag[];
  selectedPatterns: Pattern[];
  selectedCases: CaseReference[];
  layoutScheme?: LayoutScheme;
  colorScheme?: ColorScheme;
  canvasAssets?: FinalCanvasAsset[];
  selectedReferenceImageUrls?: string[];
}

export interface GeneratedProposal {
  sourceProposalId?: string;
  parentProposalId?: string;
  familyId?: string;
  editProtection?: { region: EditRegion; pixels: {left:number;top:number;width:number;height:number}; outsideRegion: 'pixel-identical' };
  review?: {status:'pending'|'accepted';checks:string[];acceptedAt?:string;previous?:GeneratedProposal};
  projectId?: string;
  projectName?: string;
  theme?: string;
  imagery?: string;
  referenceManifest?: Array<{ index: number; role: string; label: string; instruction: string }>;
  id: string;
  name?: string;
  version: number;
  imageUrl: string;
  taskId?: string;
  promptUsed: string;
  userInstruction?: string;
  inputFingerprint?: string;
  inputFingerprintVersion?: 2;
  designRationale: string;
  packageSnapshot?: FinalDesignPackage;
  createdAt: string;
  updatedAt?: string;
}

export interface AdjustmentHistoryItem {
  id: string;
  instruction: string;
  proposalId?: string;
  imageUrl?: string;
  createdAt: string;
  status: "done" | "failed";
}

export interface PackageCompleteness {
  readyCount: number;
  totalCount: number;
  missingLabels: string[];
}
