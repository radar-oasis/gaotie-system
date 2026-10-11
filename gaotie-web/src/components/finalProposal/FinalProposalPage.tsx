import { prepareFinalDesignPackage } from './prepareFinalDesignPackage';
import LocalEditControls from './LocalEditControls';
import ProposalReview, { beginProposalReview } from './ProposalReview';
import { provenanceOf, canvasReferenceIdentity } from '../assets/provenance';
import SaveProposalDialog, { type ProposalMetadata } from '../assets/SaveProposalDialog';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCaseSearch } from "../../context/CaseSearchContext";
import { useColorConfig } from "../../context/ColorConfigContext";
import { useFinalProposal } from "../../context/FinalProposalContext";
import { useImageSearch } from "../../context/ImageSearchContext";
import { useSharedTags } from "../../context/SharedTagsContext";
import { useSuperCanvas } from "../../context/SuperCanvasContext";
import { useProject } from "../../projects/ProjectContext";
import {
  archiveFinalProposal,
  deleteArchivedProposal,
  generateFinalProposal,
  iterateFinalProposal,
  listArchivedProposals,
} from "./finalProposalApi";
import {
  summarizePackageCompleteness,
} from "./finalDesignPackage";
import { buildFinalInputFingerprint } from "./finalInputFingerprint";
import type {
  EditRegion,
  FinalCanvasAsset,
  FinalDesignPackage,
} from "./finalProposalTypes";
import ArchivedProposalPanel from "./ArchivedProposalPanel";
import DesignInputPipeline from "./DesignInputPipeline";
import GenerationPreview from "./GenerationPreview";
import ProposalAdjustChat from "./ProposalAdjustChat";
import "./FinalProposalPage.css";
import { paletteToScheme } from '../colorConfig/colorStudio';

const CRUISE_MOCK_PROJECT_NAME = "邮轮";
const CRUISE_MOCK_DELAY_MS = 5000;
const CRUISE_MOCK_EFFECT_IMAGE_URL =
  "/generated/final-proposals/mock-cruise-effect-1.png";

type NavigationTab =
  | "demand"
  | "image"
  | "layout"
  | "color"
  | "canvas"
  | "case";

interface FinalProposalPageProps {
  onNavigate?: (tab: NavigationTab) => void;
}

export default function FinalProposalPage({
  onNavigate,
}: FinalProposalPageProps) {
  const { confirmedTags } = useSharedTags();
  const { currentProject } = useProject();
  const { selectedPatterns } = useImageSearch();
  const { selectedCases } = useCaseSearch();
  const {
    selectedLayoutScheme,
    currentColorScheme,
    colorRegions,
    extractedPalette,
    studio,
    setStudio,
    savedSchemes,
  } = useColorConfig();
  const { captures, layers } = useSuperCanvas();
  const {
    selectedReferenceImageUrls,
    setSelectedReferenceImageUrls,
    selectedReferenceAssetIds,
    setSelectedReferenceAssetIds,
    referenceRemovalNotice,
    setReferenceRemovalNotice,
    currentProposal,
    setCurrentProposal,
    archivedProposals,
    setArchivedProposals,
    isGenerating,
    setIsGenerating,
    adjustmentHistory,
    setAdjustmentHistory,
    addAdjustmentHistory,
  } = useFinalProposal();
  const [editMode, setEditMode] = useState<'global'|'local'>('global');
  const [editRegion, setEditRegion] = useState<EditRegion>();
  const mounted = useRef(true);
  const generationRequest = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current=true; return () => {mounted.current=false;generationRequest.current?.abort();if(generationRequest.current)setIsGenerating(false);}; }, [setIsGenerating]);
  useEffect(() => { setEditRegion(undefined); setEditMode('global'); }, [currentProject?.id, currentProposal?.id]);
  useEffect(() => { generationRequest.current?.abort(); }, [currentProject?.id]);
  const [allProjectsFor, setAllProjectsFor] = useState<string | null>(null);
  const archiveScope = currentProject?.id && allProjectsFor === currentProject.id ? 'all' : 'project';
  const activeProjectId = useRef(currentProject?.id);
  useEffect(() => { activeProjectId.current = currentProject?.id; }, [currentProject?.id]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [savedNotice, setSavedNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const canvasAssets = useMemo<FinalCanvasAsset[]>(() => {
    const captureAssets: FinalCanvasAsset[] = captures.map((capture) => ({
      id: capture.id,
      name: capture.name,
      imageUrl: capture.src,
      source: "capture" as const,
      referenceKind: "capture" as const,
      sourceAssetId: capture.sourceAssetId,
      provenance: capture.provenance,
    }));
    const transformed: FinalCanvasAsset[] = layers.flatMap(layer => layer.type === 'image' && (layer.generated || layer.id.startsWith('ai-'))
      ? [{ id: layer.id, name: layer.name, imageUrl: layer.src, ...canvasReferenceIdentity(layer), source: 'layer' as const, provenance: provenanceOf(layer) }] : []);
    return [...captureAssets, ...transformed];
  }, [captures, layers]);

  const fallbackColorScheme = useMemo(() => {
    if (studio.activePaletteId !== '__legacy__') {
      const selected = studio.palettes.find(p=>p.id===studio.activePaletteId);
      return selected ? paletteToScheme(selected) : undefined;
    }
    if (currentColorScheme) {
      return currentColorScheme;
    }
    if (savedSchemes.length) return savedSchemes[0];

    if (!selectedLayoutScheme || colorRegions.length === 0) {
      return undefined;
    }

    return {
      id: "current-color-draft",
      name: "当前色彩草案",
      layoutSchemeId: selectedLayoutScheme.id,
      layoutComponentsMap: selectedLayoutScheme.componentsMap,
      regions: colorRegions,
      palette: extractedPalette,
      createdAt: new Date().toISOString(),
    };
  }, [
    colorRegions,
    currentColorScheme,
    extractedPalette,
    selectedLayoutScheme,
    studio.activePaletteId,
    studio.palettes,
    savedSchemes,
  ]);

  const designPackage = useMemo<FinalDesignPackage>(
    () => ({
      demandTags: confirmedTags,
      selectedPatterns,
      selectedCases,
      layoutScheme: selectedLayoutScheme ?? undefined,
      colorScheme: fallbackColorScheme,
      canvasAssets,
      selectedReferenceAssetIds: selectedReferenceAssetIds ?? undefined,
      selectedReferenceImageUrls,
    }),
    [
      canvasAssets,
      confirmedTags,
      fallbackColorScheme,
      selectedCases,
      selectedLayoutScheme,
      selectedPatterns,
      selectedReferenceAssetIds,
      selectedReferenceImageUrls,
    ],
  );
  useEffect(() => {
    let active = true;
    setArchivedProposals([]);
    if (!currentProject?.id) return;
    void listArchivedProposals(archiveScope === 'all' ? { scope: 'all' } : { projectId: currentProject.id })
      .then(proposals => { if (active) setArchivedProposals(proposals); })
      .catch((error: unknown) => {
        if (active) setErrorMessage(error instanceof Error ? error.message : '加载归档方案失败');
      });
    return () => { active = false; };
  }, [archiveScope, currentProject?.id, setArchivedProposals]);

  const completeness = useMemo(
    () => summarizePackageCompleteness(designPackage),
    [designPackage],
  );
  const currentInputFingerprint = useMemo(
    () => buildFinalInputFingerprint(designPackage, selectedReferenceImageUrls),
    [designPackage, selectedReferenceImageUrls],
  );
  const isCurrentProposalStale = Boolean(
    currentProposal &&
    (currentProposal.inputFingerprintVersion === 2 ? currentProposal.inputFingerprint : currentProposal.packageSnapshot
      ? buildFinalInputFingerprint(currentProposal.packageSnapshot, currentProposal.packageSnapshot.selectedReferenceImageUrls ?? [])
      : currentProposal.inputFingerprint) !== currentInputFingerprint,
  );

  const toggleReference = useCallback((imageUrl: string, assetId?: string) => {
    const targetId = assetId ?? canvasAssets.find(asset=>asset.imageUrl===imageUrl)?.id;
    if (!targetId) return;
    const ids = selectedReferenceAssetIds ?? canvasAssets.filter(asset=>selectedReferenceImageUrls.includes(asset.imageUrl)).map(asset=>asset.id);
    const next = ids.includes(targetId) ? ids.filter(id=>id!==targetId) : [...ids,targetId];
    setSelectedReferenceAssetIds(next);
    setSelectedReferenceImageUrls([...new Set(canvasAssets.filter(asset=>next.includes(asset.id)).map(asset=>asset.imageUrl))]);
    setReferenceRemovalNotice('');
  }, [canvasAssets, selectedReferenceAssetIds, selectedReferenceImageUrls, setSelectedReferenceAssetIds, setSelectedReferenceImageUrls, setReferenceRemovalNotice]);

  const handleGenerate = useCallback(
    async (userPrompt: string) => {
      const controller = new AbortController();
      generationRequest.current?.abort();
      generationRequest.current = controller;
      const requestProjectId = currentProject?.id;
      const stillActive = () => mounted.current && !controller.signal.aborted && activeProjectId.current === requestProjectId;
      setErrorMessage("");
      setIsGenerating(true);

      try {
        if (import.meta.env.VITE_ENABLE_CRUISE_MOCK === 'true' && currentProject?.name.trim() === CRUISE_MOCK_PROJECT_NAME) {
          await delay(CRUISE_MOCK_DELAY_MS);

          const createdAt = new Date().toISOString();
          const proposal = {
            id: `mock-cruise-${Date.now()}`,
            name: "方案 V1",
            version: 1,
            imageUrl: CRUISE_MOCK_EFFECT_IMAGE_URL,
            taskId: "mock-cruise-effect",
            promptUsed: userPrompt || "邮轮项目模拟生成",
            designRationale: "基于当前设计输入生成的邮轮涂装效果",
            createdAt,
          };

          if (!stillActive()) return;
          setCurrentProposal({
            ...proposal,
            sourceProposalId: proposal.id, familyId: proposal.id,
            review: beginProposalReview(currentProposal),
          projectId: currentProject?.id,
          projectName: currentProject?.name,
            packageSnapshot: designPackage,
            inputFingerprint: currentInputFingerprint,
          });
          addAdjustmentHistory({
            id: `history-${Date.now()}`,
            instruction: userPrompt || "生成最终效果",
            proposalId: proposal.id,
            imageUrl: proposal.imageUrl,
            createdAt,
            status: "done",
          });

          return;
        }

        const preparedPackage = await prepareFinalDesignPackage(designPackage, layers);
        if (!stillActive()) return;
        const proposal = await generateFinalProposal({
          signal: controller.signal,
          designPackage: preparedPackage,
          userPrompt,
          selectedReferenceImageUrls: preparedPackage.selectedReferenceImageUrls,
        });
        if (!stillActive()) return;
        setCurrentProposal({
          ...proposal,
          sourceProposalId: proposal.id, familyId: proposal.id,
          userInstruction: userPrompt,
          review: beginProposalReview(currentProposal),
          projectId: currentProject?.id,
          projectName: currentProject?.name,
          packageSnapshot: preparedPackage,
          inputFingerprintVersion: 2,
          inputFingerprint: currentInputFingerprint,
        });
        addAdjustmentHistory({
          id: `history-${Date.now()}`,
          instruction: userPrompt || "生成最终效果",
          proposalId: proposal.id,
          imageUrl: proposal.imageUrl,
          createdAt: new Date().toISOString(),
          status: "done",
        });
      } catch (error) {
        if (!stillActive()) return;
        const message = error instanceof Error ? error.message : "生成失败";
        setErrorMessage(message);
        addAdjustmentHistory({
          id: `history-${Date.now()}`,
          instruction: userPrompt || "生成最终效果",
          createdAt: new Date().toISOString(),
          status: "failed",
        });
      } finally {
        if (stillActive()) { setIsGenerating(false); generationRequest.current = null; }
      }
    },
    [
      addAdjustmentHistory,
      currentProposal,
      currentProject?.name,
      currentProject?.id,
      designPackage,
      layers,
      currentInputFingerprint,
      selectedReferenceImageUrls,
      setCurrentProposal,
      setIsGenerating,
    ],
  );

  const handleIterate = useCallback(
    async (instruction: string) => {
      if (!currentProposal) {
        return;
      }

      const controller = new AbortController();
      generationRequest.current?.abort();
      generationRequest.current = controller;
      const requestProjectId = currentProject?.id;
      const stillActive = () => mounted.current && !controller.signal.aborted && activeProjectId.current === requestProjectId;
      setErrorMessage("");
      setIsGenerating(true);

      try {
        const preparedPackage = await prepareFinalDesignPackage(designPackage, layers);
        if (!stillActive()) return;
        const proposal = await iterateFinalProposal({
          signal: controller.signal,
          editMode,
          editRegion: editMode === 'local' ? editRegion : undefined,
          baseProposalId: currentProposal.sourceProposalId || currentProposal.id,
          selectedReferenceImageUrls: preparedPackage.selectedReferenceImageUrls,
          baseImageUrl: currentProposal.imageUrl,
          instruction,
          designPackage: preparedPackage,
        });
        if (!stillActive()) return;
        setCurrentProposal({
          ...proposal,
          sourceProposalId: proposal.id,
          parentProposalId: currentProposal.sourceProposalId || currentProposal.id,
          familyId: currentProposal.familyId || currentProposal.sourceProposalId || currentProposal.id,
          review: beginProposalReview(currentProposal),
          projectId: currentProject?.id,
          projectName: currentProject?.name,
          version: currentProposal.version + 1,
          packageSnapshot: preparedPackage,
          inputFingerprintVersion: 2,
          userInstruction: instruction,
          inputFingerprint: currentInputFingerprint,
        });
        addAdjustmentHistory({
          id: `history-${Date.now()}`,
          instruction,
          proposalId: proposal.id,
          imageUrl: proposal.imageUrl,
          createdAt: new Date().toISOString(),
          status: "done",
        });
      } catch (error) {
        if (!stillActive()) return;
        const message = error instanceof Error ? error.message : "再次生成失败";
        setErrorMessage(message);
        addAdjustmentHistory({
          id: `history-${Date.now()}`,
          instruction,
          createdAt: new Date().toISOString(),
          status: "failed",
        });
      } finally {
        if (stillActive()) { setIsGenerating(false); generationRequest.current = null; }
      }
    },
    [
      addAdjustmentHistory,
      currentProposal,
      editMode,
      editRegion,
      currentProject?.id,
      currentProject?.name,
      currentInputFingerprint,
      designPackage,
      layers,
      selectedReferenceImageUrls,
      setCurrentProposal,
      setIsGenerating,
    ],
  );

  const handleClearCurrentProposal = useCallback(() => {
    setCurrentProposal(null);
    setAdjustmentHistory([]);
    setErrorMessage("");
  }, [setAdjustmentHistory, setCurrentProposal]);

  const handleArchive = useCallback(async (metadata: ProposalMetadata) => {
    if (!currentProposal) return;
    if (currentProposal.review?.status === "pending") throw new Error("请先完成逐项验收并接受结果");
    if (!currentProposal.packageSnapshot) throw new Error('该效果缺少生成时的设计记录，请重新生成后保存');
    const projectId = currentProposal.projectId ?? currentProject?.id;
    if (!projectId) throw new Error('请先选择项目');
    const archived = await archiveFinalProposal({
      ...metadata,
      projectId,
      projectName: currentProposal.projectName ?? currentProject?.name,
      sourceProposalId: currentProposal.sourceProposalId || currentProposal.id,
      parentProposalId: currentProposal.parentProposalId,
      familyId: currentProposal.familyId,
      inputFingerprint: currentProposal.inputFingerprint,
      inputFingerprintVersion: currentProposal.inputFingerprintVersion,
      editProtection: currentProposal.editProtection,
      review: currentProposal.review,
      version: currentProposal.version,
      imageUrl: currentProposal.imageUrl,
      promptUsed: currentProposal.promptUsed,
      designRationale: currentProposal.designRationale,
      packageSnapshot: currentProposal.packageSnapshot,
      userInstruction: currentProposal.userInstruction,
    });
    if (!mounted.current || activeProjectId.current !== currentProject?.id) return;
    setArchivedProposals(previous => [archived, ...previous.filter(item => item.id !== archived.id)]);
    // Keep the generated proposal identity for idempotent saves and iteration.
    setCurrentProposal({...currentProposal, ...metadata});
    setSavedNotice('方案已保存，可在资产沉淀中查看');
    setErrorMessage('');
  }, [currentProposal, currentProject, setArchivedProposals, setCurrentProposal]);

  const handleDeleteArchived = useCallback(
    async (id: string) => {
      const projectId = currentProject?.id;
      try {
        await deleteArchivedProposal(id);
        if (!mounted.current || activeProjectId.current !== projectId) return;
        setArchivedProposals(previous => previous.filter((proposal) => proposal.id !== id));
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "删除方案失败",
        );
      }
    },
    [currentProject?.id, setArchivedProposals],
  );

  return (
    <div className="final-proposal-page">
      {showSaveDialog && currentProposal && <SaveProposalDialog proposal={currentProposal}
        projectName={currentProposal.projectName ?? currentProject?.name ?? '未命名项目'}
        onSave={handleArchive} onClose={() => setShowSaveDialog(false)}/>}

      <div className="final-reference-column">
      <DesignInputPipeline
        designPackage={designPackage}
        completeness={completeness}
        selectedReferenceImageUrls={selectedReferenceImageUrls}
        selectedReferenceAssetIds={selectedReferenceAssetIds}
        onToggleReference={toggleReference}
        onNavigate={onNavigate}
      />

        <div className="proposal-color-direction">
          <label htmlFor="final-color-direction">配色参考（可选） </label>
          <select id="final-color-direction" aria-label="最终配色参考" disabled={isGenerating} value={studio.activePaletteId ?? ''} onChange={e=>setStudio(s=>({...s,activePaletteId:e.target.value || null}))}>
            <option value="">不使用色板 · 直接描述颜色</option>
            {studio.palettes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            {(currentColorScheme || savedSchemes.length>0 || colorRegions.length>0)&&<option value="__legacy__">旧版区域配色方案</option>}
          </select>
          <details><summary>配色说明</summary><small>仅参考整体色系，不绑定布局区域。本次文字要求优先，也可选择不使用色板。</small></details>
        </div>
      </div>
      <main className="final-proposal-main">
        {referenceRemovalNotice && <p className="proposal-hint" role="status">{referenceRemovalNotice}</p>}
        <GenerationPreview
          currentProposal={currentProposal}
          isGenerating={isGenerating}
          errorMessage={errorMessage}
          onArchive={() => setShowSaveDialog(true)}
          onClearCurrentProposal={handleClearCurrentProposal}
        />
        {currentProposal && !isGenerating && <ProposalReview proposal={currentProposal} onChange={setCurrentProposal} disabled={isGenerating} />}
        {currentProposal && !isCurrentProposalStale && currentProposal.review?.status !== 'pending' && <LocalEditControls imageUrl={currentProposal.imageUrl} mode={editMode} onModeChange={setEditMode} region={editRegion} onRegionChange={setEditRegion} disabled={isGenerating} />}
        <ProposalAdjustChat
          generationMode={
            currentProposal
              ? isCurrentProposalStale
                ? "regenerate"
                : "iterate"
              : "generate"
          }
          isGenerating={isGenerating}
          editMode={editMode}
          submitBlocked={currentProposal?.review?.status === 'pending' || (editMode === 'local' && !isCurrentProposalStale && (!editRegion || editRegion.width <= 0 || editRegion.height <= 0 || editRegion.x < 0 || editRegion.y < 0 || editRegion.x + editRegion.width > 1 || editRegion.y + editRegion.height > 1))}
          completeness={completeness}
          adjustmentHistory={adjustmentHistory}
          onGenerate={handleGenerate}
          onIterate={handleIterate}
        />
      {savedNotice && <p role="status" style={{padding:"0 24px",fontSize:13}}>{savedNotice}</p>}
      <ArchivedProposalPanel
        proposals={archiveScope === 'all' ? archivedProposals : archivedProposals.filter(proposal => proposal.projectId === currentProject?.id)}
        scope={archiveScope}
        onScopeChange={scope => setAllProjectsFor(scope === 'all' ? currentProject?.id ?? null : null)}
        currentProposal={currentProposal}
        onDelete={handleDeleteArchived}
      />
      </main>
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
