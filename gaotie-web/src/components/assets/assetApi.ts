import type { PatternProvenance } from './provenance';
import { apiUrl } from "../../utils/backendUrls";
import type { FinalDesignPackage, GeneratedProposal } from "../finalProposal/finalProposalTypes";
export interface Asset {
  id: string;
  kind: "pattern" | "proposal";
  name: string;
  imageUrl: string;
  projectId: string | null;
  projectName: string;
  theme: string;
  imagery: string;
  createdAt: string;
  lineage?: {parent?: {id:string; name:string}; children:{id:string; name:string}[]; parentStatus:'available'|'not-saved'|'unknown'};
  payload?: {
    review?: GeneratedProposal["review"];
    editProtection?: GeneratedProposal["editProtection"];
    sourceProposalId?: string;
    parentProposalId?: string;
    familyId?: string;
    provenance?: PatternProvenance;
    sourceImageUrl?: string;
    prompt?: string;
    version?: number;
    promptUsed?: string;
    designRationale?: string;
    packageSnapshot?: FinalDesignPackage;
    userInstruction?: string;
  };
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "资产操作失败，请重试");
  return body as T;
}
export const listAssets = () => request<Asset[]>("/assets");
export const getAsset = (id: string) =>
  request<Asset>(`/assets/${encodeURIComponent(id)}`);
export const removeAsset = (id: string) =>
  request(`/assets/${encodeURIComponent(id)}`, { method: "DELETE" });
export const favoriteImage = (input: {
  projectId: string;
  name: string;
  imageDataUrl: string;
  prompt?: string;
  sourceImageUrl?: string;
  provenance?: PatternProvenance;
}) =>
  request<Asset>("/assets/favorites", {
    method: "POST",
    body: JSON.stringify(input),
  });
