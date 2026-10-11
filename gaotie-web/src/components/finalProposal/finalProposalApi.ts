import type {
  EditRegion,
  FinalDesignPackage,
  GeneratedProposal,
} from "./finalProposalTypes";
import { apiUrl } from "../../utils/backendUrls";

const parseJsonSafely = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readProposal = (body: unknown): GeneratedProposal => {
  if (
    !isRecord(body) ||
    typeof body.id !== "string" ||
    typeof body.version !== "number" ||
    typeof body.imageUrl !== "string" ||
    typeof body.promptUsed !== "string" ||
    typeof body.designRationale !== "string" ||
    typeof body.createdAt !== "string"
  ) {
    throw new Error("效果生成接口返回缺少方案信息");
  }

  return {
    id: body.id,
    sourceProposalId: typeof body.sourceProposalId === 'string' ? body.sourceProposalId : undefined,
    parentProposalId: typeof body.parentProposalId === 'string' ? body.parentProposalId : undefined,
    familyId: typeof body.familyId === 'string' ? body.familyId : undefined,
    editProtection: isRecord(body.editProtection) ? body.editProtection as unknown as GeneratedProposal['editProtection'] : undefined,
    review: isRecord(body.review) ? body.review as unknown as GeneratedProposal['review'] : undefined,
    projectId: typeof body.projectId === "string" ? body.projectId : undefined,
    projectName: typeof body.projectName === "string" ? body.projectName : undefined,
    theme: typeof body.theme === "string" ? body.theme : undefined,
    imagery: typeof body.imagery === "string" ? body.imagery : undefined,
    referenceManifest: Array.isArray(body.referenceManifest)
      ? body.referenceManifest.filter((item): item is { index: number; role: string; label: string; instruction: string } => isRecord(item) && typeof item.index === 'number' && typeof item.role === 'string' && typeof item.label === 'string' && typeof item.instruction === 'string')
      : undefined,
    version: body.version,
    imageUrl: body.imageUrl,
    taskId: typeof body.taskId === "string" ? body.taskId : undefined,
    promptUsed: body.promptUsed,
    designRationale: body.designRationale,
    createdAt: body.createdAt,
    inputFingerprintVersion: body.inputFingerprintVersion === 2 ? 2 : undefined,
    inputFingerprint:
      typeof body.inputFingerprint === "string"
        ? body.inputFingerprint
        : undefined,
    name: typeof body.name === "string" ? body.name : undefined,
    userInstruction:
      typeof body.userInstruction === "string"
        ? body.userInstruction
        : undefined,
    packageSnapshot: isRecord(body.packageSnapshot)
      ? (body.packageSnapshot as unknown as FinalDesignPackage)
      : undefined,
    updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : undefined,
  };
};

const requestJson = async (
  path: string,
  init?: RequestInit,
): Promise<unknown> => {
  const response = await fetch(apiUrl(path), { ...init, credentials: "include" });
  const body = await parseJsonSafely(response);

  if (!response.ok) {
    const message = isRecord(body) ? body.message : undefined;
    throw new Error(
      typeof message === "string"
        ? message
        : `方案接口请求失败：${response.status}`,
    );
  }

  return body;
};

export const generateFinalProposal = async (input: {
  signal?: AbortSignal;
  designPackage: FinalDesignPackage;
  userPrompt?: string;
  selectedReferenceImageUrls?: string[];
}): Promise<GeneratedProposal> =>
  readProposal(
    await requestJson("/final-proposals/generate", {
      signal: input.signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input, (key,value) => key === "signal" ? undefined : value),
    }),
  );

export const iterateFinalProposal = async (input: {
  signal?: AbortSignal;
  editMode?: 'global' | 'local';
  editRegion?: EditRegion;
  selectedReferenceImageUrls?: string[];
  baseProposalId: string;
  baseImageUrl: string;
  instruction: string;
  designPackage: FinalDesignPackage;
}): Promise<GeneratedProposal> =>
  readProposal(
    await requestJson("/final-proposals/iterate", {
      signal: input.signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input, (key,value) => key === "signal" ? undefined : value),
    }),
  );

export const archiveFinalProposal = async (input: {
  projectId: string;
  projectName?: string;
  theme?: string;
  imagery?: string;
  sourceProposalId?: string;
  parentProposalId?: string;
  familyId?: string;
  editProtection?: GeneratedProposal['editProtection'];
  review?: GeneratedProposal['review'];
  inputFingerprint?: string;
  inputFingerprintVersion?: 2;
  userInstruction?: string;
  name?: string;
  version: number;
  imageUrl: string;
  promptUsed: string;
  designRationale: string;
  packageSnapshot: FinalDesignPackage;
}): Promise<GeneratedProposal> =>
  readProposal(
    await requestJson("/final-proposals/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input, (key,value) => key === "signal" ? undefined : value),
    }),
  );

export type ArchiveScope = { projectId: string } | { scope: 'all' };

export const listArchivedProposals = async (scope: ArchiveScope): Promise<GeneratedProposal[]> => {
  const query = 'projectId' in scope
    ? `projectId=${encodeURIComponent(scope.projectId)}`
    : 'scope=all';
  const body = await requestJson(`/final-proposals?${query}`);

  return Array.isArray(body) ? body.map(readProposal) : [];
};

export const deleteArchivedProposal = async (id: string): Promise<void> => {
  await requestJson(`/final-proposals/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};
