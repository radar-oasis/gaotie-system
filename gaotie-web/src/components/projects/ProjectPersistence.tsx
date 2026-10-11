import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useCaseSearch } from '../../context/CaseSearchContext';
import { useChat } from '../../context/ChatContext';
import { useColorConfig } from '../../context/ColorConfigContext';
import { useFinalProposal } from '../../context/FinalProposalContext';
import { useImageSearch } from '../../context/ImageSearchContext';
import { useSharedTags } from '../../context/SharedTagsContext';
import { useSuperCanvas } from '../../context/SuperCanvasContext';
import { useProject } from '../../projects/ProjectContext';
import {
  getProjectSnapshot,
  saveProjectSnapshot,
} from '../../projects/projectApi';
import {
  createEmptyWorkspaceSnapshot,
  normalizeWorkspaceSnapshot,
  type WorkspaceSnapshot,
  type WorkspaceTab,
} from '../../projects/workspaceSnapshot';
import ProjectBar from './ProjectBar';

const AUTO_SAVE_DELAY_MS = 1500;
const DEFAULT_CANVAS_STATUS = createEmptyWorkspaceSnapshot().canvas.statusMessage;

const stripTransientCanvasLayers = (
  layers: WorkspaceSnapshot['canvas']['layers'],
) => layers.filter((layer) => layer.type !== 'generation-placeholder');

const getPersistedCanvasStatus = (statusMessage: string) =>
  /正在调用|正在生成|生成中/.test(statusMessage)
    ? DEFAULT_CANVAS_STATUS
    : statusMessage;

const getValidSelectedLayerId = (
  layers: WorkspaceSnapshot['canvas']['layers'],
  selectedLayerId: string | null,
) =>
  selectedLayerId && layers.some((layer) => layer.id === selectedLayerId)
    ? selectedLayerId
    : null;

interface ProjectPersistenceProps {
  activeTab: WorkspaceTab;
  onRestoreTab: (tab: WorkspaceTab) => void;
  children: ReactNode;
}

export default function ProjectPersistence({
  activeTab,
  onRestoreTab,
  children,
}: ProjectPersistenceProps) {
  const { currentProject, markSaved } = useProject();
  const chat = useChat();
  const sharedTags = useSharedTags();
  const image = useImageSearch();
  const caseSearch = useCaseSearch();
  const colorConfig = useColorConfig();
  const canvas = useSuperCanvas();
  const finalProposal = useFinalProposal();
  const [isSaving, setIsSaving] = useState(false);
  const [savePulse, setSavePulse] = useState(0);
  const restoringProjectId = useRef<string | null>(null);
  const restoreSequence = useRef(0);
  const restoredProjectId = useRef<string | null>(null);
  const lastSavedSnapshotKey = useRef<string | null>(null);
  const skipNextAutoSave = useRef(false);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSavePromiseRef = useRef<Promise<void> | null>(null);
  const pendingSaveAfterInFlight = useRef(false);
  const currentProjectIdRef = useRef<string | null>(null);
  const latestWorkspace = useRef<{project: NonNullable<typeof currentProject>; snapshot: WorkspaceSnapshot; key: string} | null>(null);
  const switchingSaves = useRef(new Map<string, Promise<void>>());
  const referenceAssetsRef = useRef(new Map<string, {name: string; imageUrl: string}>());

  useEffect(() => {
    currentProjectIdRef.current = currentProject?.id ?? null;
  }, [currentProject?.id]);

  const buildSnapshot = useCallback((savedAt?: string): WorkspaceSnapshot => {
    const canvasLayers = stripTransientCanvasLayers(canvas.layers);
    const selectedLayerId = getValidSelectedLayerId(
      canvasLayers,
      canvas.selectedLayerId,
    );

    return {
      ...createEmptyWorkspaceSnapshot(),
      activeTab,
      demand: {
        chatHistory: chat.chatHistory,
        selectedTags: chat.selectedTags,
      },
      sharedTags: {
        confirmedTags: sharedTags.confirmedTags,
      },
      image: {
        patterns: image.patterns,
        searchGroups: image.searchGroups,
        selectedPatterns: image.selectedPatterns,
        intentFilters: image.intentFilters,
        reasoning: image.reasoning,
        searchMessage: image.searchMessage,
        autoSearchKey: image.autoSearchKey,
        searchInput: image.searchInput,
      },
      caseSearch: {
        chatHistory: caseSearch.chatHistory,
        selectedCases: caseSearch.selectedCases,
      },
      colorConfig: {
        studio: colorConfig.studio,
        selectedLayoutScheme: colorConfig.selectedLayoutScheme,
        colorRegions: colorConfig.colorRegions,
        selectedRegionId: colorConfig.selectedRegionId,
        currentColorScheme: colorConfig.currentColorScheme,
        savedSchemes: colorConfig.savedSchemes,
        extractedPalette: colorConfig.extractedPalette,
        paletteGroups: colorConfig.paletteGroups,
        uploadedImage: colorConfig.uploadedImage,
        selectedPaletteColor: colorConfig.selectedPaletteColor,
      },
      canvas: {
        layers: canvasLayers,
        selectedLayerId,
        tool: canvas.tool,
        zoom: canvas.zoom,
        brushColor: canvas.brushColor,
        brushSize: canvas.brushSize,
        captures: canvas.captures,
        promptAssets: canvas.promptAssets,
        prompt: canvas.prompt,
        statusMessage: getPersistedCanvasStatus(canvas.statusMessage),
        leftCollapsed: canvas.leftCollapsed,
        rightCollapsed: canvas.rightCollapsed,
        leftWidth: canvas.leftWidth,
        rightWidth: canvas.rightWidth,
      },
      finalProposal: {
        currentProposal: finalProposal.currentProposal,
        archivedProposals: [],
        selectedReferenceAssetIds: finalProposal.selectedReferenceAssetIds,
        selectedReferenceImageUrls: finalProposal.selectedReferenceImageUrls,
        adjustmentHistory: finalProposal.adjustmentHistory,
        selectedCompareIds: finalProposal.selectedCompareIds,
      },
      savedAt,
    };
  }, [
    activeTab,
    canvas,
    caseSearch,
    chat,
    colorConfig,
    finalProposal,
    image,
    sharedTags.confirmedTags,
  ]);

  const getSnapshotKey = useCallback(
    () => JSON.stringify(buildSnapshot('')),
    [buildSnapshot],
  );

  useEffect(() => {
    if (currentProject && restoredProjectId.current === currentProject.id &&
        restoringProjectId.current !== currentProject.id) {
      latestWorkspace.current = {project: currentProject, snapshot: buildSnapshot(), key: getSnapshotKey()};
    }
  }, [buildSnapshot, currentProject, getSnapshotKey]);

  const applySnapshot = useCallback(
    (snapshot: WorkspaceSnapshot) => {
      // A late query must not overwrite a restored project's groups or filters.
      image.searchRequestRef.current?.abort();
      colorConfig.studioRequestRef.current?.abort();
      colorConfig.setStudio(snapshot.colorConfig.studio);
      chat.setChatHistory(snapshot.demand.chatHistory);
      chat.setSelectedTags(snapshot.demand.selectedTags);
      sharedTags.setConfirmedTags(snapshot.sharedTags.confirmedTags);

      image.setPatterns(snapshot.image.patterns);
      image.setSearchGroups(snapshot.image.searchGroups);
      image.setSelectedPatterns(snapshot.image.selectedPatterns);
      image.setIntentFilters(snapshot.image.intentFilters);
      image.setReasoning(snapshot.image.reasoning);
      image.setSearchMessage(snapshot.image.searchMessage);
      image.setAutoSearchKey(snapshot.image.autoSearchKey);
      image.setSearchInput(snapshot.image.searchInput);
      image.setIsSearching(false);

      caseSearch.setChatHistory(snapshot.caseSearch.chatHistory);
      caseSearch.setSelectedCases(snapshot.caseSearch.selectedCases);
      caseSearch.setIsLoading(false);

      colorConfig.setSelectedLayoutScheme(
        snapshot.colorConfig.selectedLayoutScheme,
      );
      colorConfig.setColorRegions(snapshot.colorConfig.colorRegions);
      colorConfig.setSelectedRegionId(snapshot.colorConfig.selectedRegionId);
      colorConfig.setCurrentColorScheme(
        snapshot.colorConfig.currentColorScheme,
      );
      colorConfig.setSavedSchemes(snapshot.colorConfig.savedSchemes);
      colorConfig.setExtractedPalette(snapshot.colorConfig.extractedPalette);
      colorConfig.setPaletteGroups(snapshot.colorConfig.paletteGroups);
      colorConfig.setUploadedImage(snapshot.colorConfig.uploadedImage);
      colorConfig.setSelectedPaletteColor(
        snapshot.colorConfig.selectedPaletteColor,
      );

      const canvasLayers = stripTransientCanvasLayers(snapshot.canvas.layers);
      const selectedLayerId = getValidSelectedLayerId(
        canvasLayers,
        snapshot.canvas.selectedLayerId,
      );

      canvas.setLayers(canvasLayers);
      canvas.setSelectedLayerId(selectedLayerId);
      canvas.setSelectedLayerIds(selectedLayerId ? [selectedLayerId] : []);
      canvas.setTool(snapshot.canvas.tool);
      canvas.setZoom(snapshot.canvas.zoom);
      canvas.setBrushColor(snapshot.canvas.brushColor);
      canvas.setBrushSize(snapshot.canvas.brushSize);
      canvas.setCaptures(snapshot.canvas.captures);
      canvas.setPromptAssets(snapshot.canvas.promptAssets);
      canvas.setPrompt(snapshot.canvas.prompt);
      canvas.setIsGenerating(false);
      canvas.setStatusMessage(
        getPersistedCanvasStatus(snapshot.canvas.statusMessage),
      );
      canvas.setLeftCollapsed(snapshot.canvas.leftCollapsed);
      canvas.setRightCollapsed(snapshot.canvas.rightCollapsed);
      canvas.setLeftWidth(snapshot.canvas.leftWidth);
      canvas.setRightWidth(snapshot.canvas.rightWidth);

      finalProposal.setCurrentProposal(snapshot.finalProposal.currentProposal);
      finalProposal.setSelectedReferenceAssetIds(snapshot.finalProposal.selectedReferenceAssetIds);
      finalProposal.setSelectedReferenceImageUrls(snapshot.finalProposal.selectedReferenceImageUrls);
      finalProposal.setReferenceRemovalNotice('');
      referenceAssetsRef.current = new Map(
        snapshot.finalProposal.currentProposal?.packageSnapshot?.canvasAssets?.map(asset => [asset.id, {name: asset.name, imageUrl: asset.imageUrl}]) ?? [],
      );
      finalProposal.setAdjustmentHistory(
        snapshot.finalProposal.adjustmentHistory,
      );
      finalProposal.setSelectedCompareIds(
        snapshot.finalProposal.selectedCompareIds,
      );
      finalProposal.setIsGenerating(false);

      onRestoreTab(snapshot.activeTab);
      lastSavedSnapshotKey.current = JSON.stringify({
        ...snapshot,
        savedAt: '',
      });
      skipNextAutoSave.current = true;
    },
    [
      canvas,
      caseSearch,
      chat,
      colorConfig,
      finalProposal,
      image,
      onRestoreTab,
      sharedTags,
    ],
  );

  useEffect(() => {
    if (
      !currentProject ||
      restoringProjectId.current === currentProject.id ||
      restoredProjectId.current === currentProject.id
    ) {
      return;
    }

    const previous = latestWorkspace.current;
    if (previous && previous.project.id !== currentProject.id && previous.key !== lastSavedSnapshotKey.current) {
      // Flush changes made inside the debounce window, after any older save.
      const save = (async () => {
        await activeSavePromiseRef.current?.catch(() => undefined);
        await saveProjectSnapshot(previous.project.id, {
          snapshot: {...previous.snapshot, savedAt: new Date().toISOString()},
          currentStep: previous.snapshot.activeTab,
          name: previous.project.name,
        });
      })().catch(error => { console.error('Failed to save previous project snapshot:', error); });
      switchingSaves.current.set(previous.project.id, save);
      void save.finally(() => {
        if (switchingSaves.current.get(previous.project.id) === save) switchingSaves.current.delete(previous.project.id);
      });
    }
    latestWorkspace.current = null;
    const projectId = currentProject.id;
    const sequence = ++restoreSequence.current;
    colorConfig.setStudioReadyProjectId(null);
    finalProposal.setArchivedProposals([]);
    restoringProjectId.current = projectId;
    restoredProjectId.current = null;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    applySnapshot({
      ...createEmptyWorkspaceSnapshot(),
      activeTab,
    });

    // An immediate return to the previous project must read the flushed snapshot.
    (switchingSaves.current.get(projectId) ?? Promise.resolve())
      .then(() => getProjectSnapshot(projectId))
      .then((response) => {
        if (restoringProjectId.current !== projectId || restoreSequence.current !== sequence) {
          return;
        }
        applySnapshot(normalizeWorkspaceSnapshot(response.snapshot));
        restoredProjectId.current = projectId;
        colorConfig.setStudioReadyProjectId(projectId);
      })
      .catch((error) => {
        console.error('Failed to restore project snapshot:', error);
        if (restoringProjectId.current === projectId && restoreSequence.current === sequence) {
          restoredProjectId.current = projectId;
          colorConfig.setStudioReadyProjectId(projectId);
        }
      })
      .finally(() => {
        if (restoringProjectId.current === projectId && restoreSequence.current === sequence) {
          restoringProjectId.current = null;
        }
      });
  }, [activeTab, applySnapshot, colorConfig, currentProject, finalProposal]);

  useEffect(() => {
    // Never reconcile against the transient empty workspace during restoration.
    if (!currentProject || restoredProjectId.current !== currentProject.id ||
        restoringProjectId.current === currentProject.id) return;
    const available = new Map([
      ...canvas.captures.map(capture => [capture.id, {name: capture.name, imageUrl: capture.src}] as const),
      ...canvas.layers.flatMap(layer => layer.type === 'image' && (layer.generated || layer.id.startsWith('ai-'))
        ? [[layer.id, {name: layer.name, imageUrl: layer.src}] as const] : []),
    ]);
    const ids = finalProposal.selectedReferenceAssetIds;
    let nextUrls: string[];
    let removedNames: string[];
    if (ids !== null) {
      const nextIds = ids.filter(id => available.has(id));
      removedNames = ids.filter(id => !available.has(id))
        .map(id => referenceAssetsRef.current.get(id)?.name ?? id);
      if (nextIds.length !== ids.length) finalProposal.setSelectedReferenceAssetIds(nextIds);
      nextUrls = [...new Set(nextIds.map(id => available.get(id)!.imageUrl))];
    } else {
      // Legacy projects cannot distinguish equal image URLs until the user next chooses a material.
      const availableUrls = new Set([...available.values()].map(asset => asset.imageUrl));
      nextUrls = finalProposal.selectedReferenceImageUrls.filter(url => availableUrls.has(url));
      removedNames = finalProposal.selectedReferenceImageUrls.filter(url => !availableUrls.has(url))
        .map(url => [...referenceAssetsRef.current.values()].find(asset => asset.imageUrl === url)?.name ?? '旧版参考图');
    }
    if (nextUrls.length !== finalProposal.selectedReferenceImageUrls.length ||
        nextUrls.some((url, index) => url !== finalProposal.selectedReferenceImageUrls[index])) {
      finalProposal.setSelectedReferenceImageUrls(nextUrls);
    }
    if (removedNames.length) finalProposal.setReferenceRemovalNotice(`已移除失效参考图：${removedNames.join('、')}`);
    referenceAssetsRef.current = available;
  }, [canvas.captures, canvas.layers, colorConfig.selectedLayoutScheme, currentProject, finalProposal]);

  const persistSnapshot = useCallback(async (options?: { silent?: boolean }) => {
    if (
      !currentProject ||
      restoringProjectId.current === currentProject.id ||
      restoredProjectId.current !== currentProject.id
    ) {
      return;
    }

    if (activeSavePromiseRef.current) {
      pendingSaveAfterInFlight.current = true;

      if (!options?.silent) {
        setIsSaving(true);
        try {
          await activeSavePromiseRef.current;
        } finally {
          setIsSaving(false);
        }
      }

      return;
    }

    const projectId = currentProject.id;
    const snapshot = buildSnapshot(new Date().toISOString());
    const snapshotKey = getSnapshotKey();

    if (!options?.silent) {
      setIsSaving(true);
    }

    const savePromise = (async () => {
      const response = await saveProjectSnapshot(projectId, {
        snapshot,
        currentStep: activeTab,
        name: currentProject.name,
      });

      if (currentProjectIdRef.current === projectId) {
        markSaved(response.project, response.updatedAt);
      }

      lastSavedSnapshotKey.current = snapshotKey;
    })();

    activeSavePromiseRef.current = savePromise;

    try {
      await savePromise;
    } catch (error) {
      console.error('Failed to save project snapshot:', error);
      if (!options?.silent) {
        alert(error instanceof Error ? error.message : '保存失败，请稍后重试');
      }
    } finally {
      if (activeSavePromiseRef.current === savePromise) {
        activeSavePromiseRef.current = null;
      }

      if (!options?.silent) {
        setIsSaving(false);
      }

      if (pendingSaveAfterInFlight.current) {
        pendingSaveAfterInFlight.current = false;
        setSavePulse((currentPulse) => currentPulse + 1);
      }
    }
  }, [activeTab, buildSnapshot, currentProject, getSnapshotKey, markSaved]);

  useEffect(() => {
    if (!currentProject || restoredProjectId.current !== currentProject.id) {
      return;
    }

    const snapshotKey = getSnapshotKey();

    if (skipNextAutoSave.current) {
      skipNextAutoSave.current = false;
      lastSavedSnapshotKey.current = snapshotKey;
      return;
    }

    if (snapshotKey === lastSavedSnapshotKey.current) {
      return;
    }

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveTimeoutRef.current = null;
      void persistSnapshot({ silent: true });
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [currentProject, getSnapshotKey, persistSnapshot, savePulse]);

  useEffect(() => {
    const flushAutoSave = () => {
      if (!currentProject || restoredProjectId.current !== currentProject.id) {
        return;
      }

      const snapshotKey = getSnapshotKey();

      if (snapshotKey === lastSavedSnapshotKey.current) {
        return;
      }

      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }

      void persistSnapshot({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushAutoSave();
      }
    };

    window.addEventListener('beforeunload', flushAutoSave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', flushAutoSave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentProject, getSnapshotKey, persistSnapshot]);

  const handleSave = useCallback(async () => {
    await persistSnapshot({ silent: false });
  }, [persistSnapshot]);

  return (
    <>
      <ProjectBar isSaving={isSaving} onSave={handleSave} />
      {children}
    </>
  );
}
