import type { EditRegion } from './local-edit';
import type { PatternProvenance } from '../assets/asset-provenance';
import type { Layout3d } from '../layout3d';

export interface DemandTag {
  label: string;
  topic?: string;
}

export interface FinalPatternReference {
  id: string;
  name: string;
  imageUrl: string;
  description?: string;
}

export interface FinalCaseReference {
  id: string;
  title: string;
  image: string;
  description?: string;
  userDescription?: string;
}

export interface FinalLayoutScheme {
  layout3d?: Layout3d;
  id: string;
  name: string;
  componentsMap: Record<string, string>;
}

export interface FinalColorRegion {
  id: string;
  name: string;
  color: string;
  colorName?: string;
  description?: string;
  category?: string;
  componentId?: string;
  layoutElementImageUrl?: string;
}

export interface FinalColorScheme {
  mode?: 'reference';
  colorRoles?: Array<{ hex: string; role: string; proportion: number }>;
  rationale?: string;
  id: string;
  name: string;
  regions: FinalColorRegion[];
  palette?: string[];
}

export interface FinalCanvasAsset {
  referenceKind?: 'original' | 'generated' | 'capture' | 'derived';
  sourcePatternId?: string;
  transformFingerprint?: string;
  sourceAssetId?: string;
  provenance?: PatternProvenance;
  generated?: boolean;
  id: string;
  name: string;
  imageUrl: string;
  source: 'capture' | 'layer';
}

export interface FinalDesignPackage {
  selectedReferenceAssetIds?: string[];
  selectedReferenceImageUrls?: string[];
  demandTags: DemandTag[];
  selectedPatterns: FinalPatternReference[];
  selectedCases: FinalCaseReference[];
  layoutScheme?: FinalLayoutScheme;
  colorScheme?: FinalColorScheme;
  canvasAssets?: FinalCanvasAsset[];
}

export interface GenerateFinalProposalInput {
  designPackage: FinalDesignPackage;
  userPrompt?: string;
  selectedReferenceImageUrls?: string[];
}

export interface IterateFinalProposalInput {
  editMode?: 'global' | 'local';
  editRegion?: EditRegion;
  selectedReferenceImageUrls?: string[];
  baseProposalId?: string;
  baseImageUrl: string;
  instruction: string;
  designPackage: FinalDesignPackage;
}

export interface GeneratedProposalResponse {
  editProtection?: { region: EditRegion; pixels: {left: number; top: number; width: number; height: number}; outsideRegion: 'pixel-identical' };
  reviewStatus?: 'pending';
  referenceManifest?: Array<{ index: number; role: string; label: string; instruction: string }>;
  id: string;
  version: number;
  imageUrl: string;
  taskId: string;
  promptUsed: string;
  designRationale: string;
  createdAt: string;
}

export interface ArchiveFinalProposalInput {
  name?: string;
  version: number;
  imageUrl: string;
  promptUsed: string;
  designRationale: string;
  packageSnapshot: FinalDesignPackage;
}

export interface ArchivedProposal extends ArchiveFinalProposalInput {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
}
