// @vitest-environment happy-dom
import { useEffect, useRef } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TopNav from "../TopNav";
import {
  CaseSearchContextProvider,
  useCaseSearch,
} from "../../context/CaseSearchContext";
import {
  ColorConfigProvider,
  useColorConfig,
} from "../../context/ColorConfigContext";
import {
  ImageSearchProvider,
  useImageSearch,
} from "../../context/ImageSearchContext";
import {
  SharedTagsProvider,
  useSharedTags,
} from "../../context/SharedTagsContext";
import {
  SuperCanvasProvider,
  useSuperCanvas,
} from "../../context/SuperCanvasContext";
import {
  FinalProposalProvider,
  useFinalProposal,
} from "../../context/FinalProposalContext";
import FinalProposalPage from "./FinalProposalPage";
import DesignInputPipeline from "./DesignInputPipeline";
import { summarizePackageCompleteness } from "./finalDesignPackage";
import { buildFinalInputFingerprint } from "./finalInputFingerprint";
import * as finalProposalApi from "./finalProposalApi";
import type { FinalDesignPackage } from "./finalProposalTypes";

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

const projectMock = vi.hoisted(() => ({
  currentProjectName: "默认项目",
  currentProjectId: "project-1",
}));

vi.mock("../../projects/ProjectContext", () => ({
  useProject: () => ({
    currentProject: {
      id: projectMock.currentProjectId,
      userId: "user-1",
      name: projectMock.currentProjectName,
      description: null,
      status: "active",
      currentStep: "proposal",
    },
  }),
}));

vi.mock("./finalProposalApi", () => ({
  archiveFinalProposal: vi.fn(),
  deleteArchivedProposal: vi.fn(),
  generateFinalProposal: vi.fn(),
  iterateFinalProposal: vi.fn(),
  listArchivedProposals: vi.fn(async () => []),
}));

type SeedMode = "none" | "matching-proposal" | "stale-proposal" | "legacy-saved";

const captureAsset = {
  id: "capture-1",
  name: "截取 1",
  src: "data:image/png;base64,capture",
  createdAt: "2026-05-27T00:00:00.000Z",
};

const seededDesignPackage: FinalDesignPackage = {
  demandTags: [{ label: "速度感", topic: "气质" }],
  selectedPatterns: [
    {
      id: "pattern-1",
      name: "龙纹",
      imageUrl: "images/dragon.png",
      dynasty: "唐代",
      description: "龙纹意象",
    },
  ],
  selectedCases: [
    {
      id: "case-1",
      title: "CR400BF",
      image: "样本图片/L12.png",
      userDescription: "参考CR标识位置",
    },
  ],
  layoutScheme: {
    id: "layout-1",
    name: "方案1",
    componentsMap: { 车窗带: "A2" },
  },
  colorScheme: {
    id: "color-1",
    name: "色彩方案1",
    layoutSchemeId: "layout-1",
    regions: [
      {
        id: "region-window",
        name: "车窗带",
        color: "#d5492a",
        componentId: "A2",
      },
    ],
    createdAt: "2026-05-27T00:00:00.000Z",
  },
  canvasAssets: [
    {
      id: captureAsset.id,
      name: captureAsset.name,
      imageUrl: captureAsset.src,
      source: "capture",
    },
  ],
};

function SeedFinalProposalState({ mode }: { mode: SeedMode }) {
  const sharedTags = useSharedTags();
  const imageSearch = useImageSearch();
  const caseSearch = useCaseSearch();
  const colorConfig = useColorConfig();
  const superCanvas = useSuperCanvas();
  const finalProposal = useFinalProposal();
  const seeded = useRef(false);

  useEffect(() => {
    if (mode === "none" || seeded.current) {
      return;
    }

    seeded.current = true;
    sharedTags.setConfirmedTags(seededDesignPackage.demandTags);
    imageSearch.setSelectedPatterns(seededDesignPackage.selectedPatterns);
    caseSearch.setSelectedCases(seededDesignPackage.selectedCases);
    colorConfig.setSelectedLayoutScheme(
      seededDesignPackage.layoutScheme ?? null,
    );
    colorConfig.setCurrentColorScheme(mode==='legacy-saved'?null:seededDesignPackage.colorScheme ?? null);
    if(mode==='legacy-saved')colorConfig.setSavedSchemes([seededDesignPackage.colorScheme!]);
    colorConfig.setStudio(s=>({...s,activePaletteId:'__legacy__',palettes:[{id:'studio-red',name:'独立红色系',colors:[{hex:'#cc2233',role:'主色',proportion:100}],rationale:'文字建议',source:'suggestion',createdAt:'2026-09-17'}]}));
    superCanvas.setCaptures([captureAsset]);
    finalProposal.setCurrentProposal({
      id: "proposal-1",
      version: 1,
      imageUrl: "/generated/final-proposals/proposal-1.png",
      promptUsed: "初始生成",
      designRationale: "测试方案",
      createdAt: "2026-05-27T00:00:00.000Z",
      packageSnapshot: mode === "stale-proposal" ? {...seededDesignPackage, demandTags:[{label:"旧需求"}]} : seededDesignPackage,
      inputFingerprint:
        mode === "matching-proposal"
          ? buildFinalInputFingerprint(seededDesignPackage, [])
          : "stale-input-fingerprint",
    });
  }, [
    caseSearch,
    colorConfig,
    finalProposal,
    imageSearch,
    mode,
    sharedTags,
    superCanvas,
  ]);

  return null;
}

const renderPage = async (mode: SeedMode = "none") => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  const render = async (visible = true) => act(async () => {
    root.render(
      <SharedTagsProvider>
        <ImageSearchProvider>
          <CaseSearchContextProvider>
            <ColorConfigProvider>
              <SuperCanvasProvider>
                <FinalProposalProvider>
                  <SeedFinalProposalState mode={mode} />
                  {visible && <FinalProposalPage onNavigate={vi.fn()} />}
                </FinalProposalProvider>
              </SuperCanvasProvider>
            </ColorConfigProvider>
          </CaseSearchContextProvider>
        </ImageSearchProvider>
      </SharedTagsProvider>,
    );
  });

  await render();
  return { container, root, render };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("FinalProposalPage", () => {
  it('keeps chosen references and iteration mode across navigation', async () => {
    vi.mocked(finalProposalApi.generateFinalProposal).mockResolvedValue({id:'new',version:1,imageUrl:'/new.png',promptUsed:'p',designRationale:'r',createdAt:'now'});
    const { root, container, render } = await renderPage('matching-proposal');
    await act(async () => (container.querySelector('.reference-thumb') as HTMLButtonElement).click());
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === '基于新输入重新生成')!.click());
    expect(container.textContent).toContain('微调当前方案');
    await render(false);
    await render(true);
    expect(container.querySelector('.reference-thumb')?.className).toContain('is-selected');
    expect(container.textContent).toContain('微调当前方案');
    await unmount(root, container);
  });

  it('scopes archives to the active project and ignores late responses after switching', async () => {
    let resolveOld!: (value: never[]) => void;
    vi.mocked(finalProposalApi.listArchivedProposals).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const { root, container, render } = await renderPage();
    expect(finalProposalApi.listArchivedProposals).toHaveBeenLastCalledWith({ projectId: 'project-1' });
    projectMock.currentProjectId = 'project-2';
    vi.mocked(finalProposalApi.listArchivedProposals).mockResolvedValueOnce([{id:'new',projectId:'project-2',projectName:'项目二',name:'项目二方案',version:1,imageUrl:'/new.png',promptUsed:'p',designRationale:'r',createdAt:'2026-10-09'}]);
    await render();
    expect(finalProposalApi.listArchivedProposals).toHaveBeenLastCalledWith({ projectId: 'project-2' });
    await act(async () => resolveOld([]));
    expect(container.textContent).toContain('项目二方案');
    await act(async () => {
      const select = container.querySelector('[aria-label="归档范围"]') as HTMLSelectElement;
      select.value = 'all'; select.dispatchEvent(new Event('change', {bubbles:true}));
    });
    expect(finalProposalApi.listArchivedProposals).toHaveBeenLastCalledWith({ scope: 'all' });
    await unmount(root, container);
  });

  it('can still apply a saved legacy scheme when no active legacy draft exists',async()=>{
    const {root,container}=await renderPage('legacy-saved');
    expect(container.textContent).toContain('色彩方案1');
    await unmount(root,container);
  });
  it('selects a saved independent palette and can explicitly omit color again', async()=>{
    vi.mocked(finalProposalApi.generateFinalProposal).mockResolvedValue({id:'new',version:1,imageUrl:'/new.png',promptUsed:'p',designRationale:'r',createdAt:'now'});
    const {root,container}=await renderPage('matching-proposal');
    const select=container.querySelector('[aria-label="最终配色参考"]') as HTMLSelectElement;
    await act(async()=>{select.value='studio-red';select.dispatchEvent(new Event('change',{bubbles:true}));});
    const generate=()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='基于新输入重新生成')!;
    await act(async()=>generate().click());
    expect(finalProposalApi.generateFinalProposal).toHaveBeenLastCalledWith(expect.objectContaining({designPackage:expect.objectContaining({colorScheme:expect.objectContaining({mode:'reference',regions:[],palette:['#cc2233']})})}));
    for (const checkbox of container.querySelectorAll<HTMLInputElement>('.proposal-review input[type="checkbox"]')) await act(async()=>checkbox.click());
    await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='接受本次结果')!.click());
    await act(async()=>{select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await act(async()=>generate().click());
    expect(vi.mocked(finalProposalApi.generateFinalProposal).mock.lastCall?.[0].designPackage.colorScheme).toBeUndefined();
    await unmount(root,container);
  });
  beforeEach(() => {
    vi.stubEnv('VITE_ENABLE_CRUISE_MOCK', 'false');
    vi.useRealTimers();
    projectMock.currentProjectName = "默认项目";
    projectMock.currentProjectId = "project-1";
    vi.mocked(finalProposalApi.generateFinalProposal).mockReset();
    vi.mocked(finalProposalApi.iterateFinalProposal).mockReset();
    vi.mocked(finalProposalApi.archiveFinalProposal).mockReset();
    vi.mocked(finalProposalApi.deleteArchivedProposal).mockReset();
    vi.mocked(finalProposalApi.listArchivedProposals).mockResolvedValue([]);
  });

  it('archives the generated snapshot even after the current color input changes', async () => {
    vi.mocked(finalProposalApi.archiveFinalProposal).mockResolvedValue({id:'archived',version:1,imageUrl:'/saved.png',promptUsed:'p',designRationale:'r',createdAt:'now'});
    const {root,container}=await renderPage('matching-proposal');
    const select=container.querySelector('[aria-label="最终配色参考"]') as HTMLSelectElement;
    await act(async()=>{select.value='studio-red';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent==='保存方案')!.click();});
    await act(async()=>{container.querySelector('dialog form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
    expect(finalProposalApi.archiveFinalProposal).toHaveBeenCalledWith(expect.objectContaining({
      packageSnapshot: seededDesignPackage,
      sourceProposalId: 'proposal-1',
    }));
    expect(container.textContent).toContain('方案已保存，可在资产沉淀中查看');
    await unmount(root,container);
  });

  it("renders the final proposal three-column workflow and nav entry", async () => {
    const { container, root } = await renderPage();
    const navContainer = document.createElement("div");
    const navRoot = createRoot(navContainer);

    await act(async () => {
      navRoot.render(<TopNav activeTab="proposal" onTabChange={vi.fn()} />);
    });

    expect(container.querySelector(".final-proposal-page")).not.toBeNull();
    expect(container.textContent).toContain("设计参考");
    expect(container.textContent).toContain("效果生成");
    expect(container.textContent).toContain("已保存方案");
    expect(container.textContent).not.toContain("已归档方案及报告");
    expect(navContainer.textContent).toContain("效果生成");
    expect(container.querySelector(".train-preview-frame > img")).toBeNull();
    expect(container.querySelector(".archive-card img")).toBeNull();
    expect(container.textContent).not.toContain("等待生成最终效果");
    expect(container.textContent).toContain("暂无方案归档");
    expect(container.textContent).not.toContain("方案 V1");
    expect(container.textContent).not.toContain(
      "基于当前设计输入生成的高铁涂装效果",
    );

    await unmount(root, container);
    await unmount(navRoot, navContainer);
  });

  it("hides demand goals and shows captures and generated layers as prompt images", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const designPackage = {
      demandTags: [{ label: "静谧车厢", topic: "体验目标" }],
      selectedPatterns: [
        {
          id: "pattern-1",
          name: "龙纹",
          imageUrl: "https://assets.example.com/pattern.png",
          dynasty: "唐代",
          description: "意象图不应出现在提示图区域",
        },
      ],
      selectedCases: [
        {
          id: "case-1",
          title: "列车案例",
          image: "https://assets.example.com/case.png",
        },
      ],
      canvasAssets: [
        {
          id: "capture-1",
          name: "纹样转化画布截取",
          imageUrl: "data:image/png;base64,capture",
          source: "capture" as const,
        },
        {
          id: "layer-1",
          name: "纹样转化画布图层",
          imageUrl: "data:image/png;base64,layer",
          source: "layer" as const,
        },
      ],
      selectedReferenceImageUrls: ["data:image/png;base64,capture"],
    };

    await act(async () => {
      root.render(
        <DesignInputPipeline
          designPackage={designPackage}
          completeness={summarizePackageCompleteness(designPackage)}
          selectedReferenceImageUrls={["data:image/png;base64,capture"]}
          onToggleReference={vi.fn()}
          onNavigate={vi.fn()}
        />,
      );
    });

    expect(container.textContent).not.toContain("需求目标");
    expect(container.textContent).not.toContain("体验目标 / 静谧车厢");
    expect(container.textContent).toContain("涂装案例");
    expect(container.textContent).toContain("列车案例");
    expect(container.querySelectorAll(".reference-thumb")).toHaveLength(2);
    expect(container.textContent).toContain("画布截取");
    expect(container.textContent).toContain("布局图、案例图及参考说明、配色一起发送");
    expect(container.textContent).not.toContain("纹样素材");

    await unmount(root, container);
  });

  it("uses the real service for cruise projects unless demo mode is explicitly enabled", async () => {
    vi.mocked(finalProposalApi.generateFinalProposal).mockResolvedValue({id:'real',version:1,imageUrl:'/real.png',promptUsed:'p',designRationale:'r',createdAt:'now'});
    projectMock.currentProjectName = "邮轮";
    const { container, root } = await renderPage();
    await act(async()=>{ await Promise.resolve(); });
    const button=Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='生成最终效果') as HTMLButtonElement;
    await act(async()=>{button.click();await Promise.resolve();});
    expect(finalProposalApi.generateFinalProposal).toHaveBeenCalledTimes(1);
    await unmount(root,container);
  });

  it("shows the cruise mock effect only when explicitly enabled", async () => {
    vi.stubEnv('VITE_ENABLE_CRUISE_MOCK', 'true');
    vi.useFakeTimers();
    projectMock.currentProjectName = "邮轮";
    const { container, root } = await renderPage();

    await act(async () => {
      await Promise.resolve();
    });

    const button = Array.from(container.querySelectorAll("button")).find(
      (item) => item.textContent === "生成最终效果",
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    expect(finalProposalApi.generateFinalProposal).not.toHaveBeenCalled();
    expect(container.textContent).toContain("正在生成最终效果");
    expect(container.querySelector(".train-preview-frame > img")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(4999);
      await Promise.resolve();
    });

    expect(container.querySelector(".train-preview-frame > img")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    const image = container.querySelector(
      ".train-preview-frame > img",
    ) as HTMLImageElement;
    expect(image).not.toBeNull();
    expect(image.src).toContain(
      "/generated/final-proposals/mock-cruise-effect-1.png",
    );
    expect(container.textContent).toContain("已生成");

    vi.useRealTimers();
    await unmount(root, container);
  });

  it("iterates the current proposal when the final inputs still match", async () => {
    const { container, root } = await renderPage("matching-proposal");

    vi.mocked(finalProposalApi.iterateFinalProposal).mockResolvedValue({
      id: "proposal-2",
      version: 2,
      imageUrl: "/generated/final-proposals/proposal-2.png",
      promptUsed: "微调",
      designRationale: "微调方案",
      createdAt: "2026-05-27T00:01:00.000Z",
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("微调当前方案");
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const button = Array.from(container.querySelectorAll("button")).find(
      (item) => item.textContent === "微调当前方案",
    ) as HTMLButtonElement;

    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;

    await act(async () => {
      valueSetter?.call(textarea, "车窗带加深一点");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      button.click();
    });

    expect(finalProposalApi.iterateFinalProposal).toHaveBeenCalledTimes(1);
    expect(finalProposalApi.generateFinalProposal).not.toHaveBeenCalled();

    await unmount(root, container);
  });

  it("regenerates when the current proposal no longer matches the final inputs", async () => {
    const { container, root } = await renderPage("stale-proposal");

    vi.mocked(finalProposalApi.generateFinalProposal).mockResolvedValue({
      id: "proposal-regenerated",
      version: 1,
      imageUrl: "/generated/final-proposals/regenerated.png",
      promptUsed: "重新生成",
      designRationale: "重新生成方案",
      createdAt: "2026-05-27T00:02:00.000Z",
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("基于新输入重新生成");
    const button = Array.from(container.querySelectorAll("button")).find(
      (item) => item.textContent === "基于新输入重新生成",
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    expect(finalProposalApi.generateFinalProposal).toHaveBeenCalledTimes(1);
    expect(finalProposalApi.iterateFinalProposal).not.toHaveBeenCalled();

    await unmount(root, container);
  });

  it("clears the current proposal without clearing left-side design inputs", async () => {
    const { container, root } = await renderPage("matching-proposal");

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("方案1");
    expect(container.textContent).toContain("微调当前方案");

    const clearButton = Array.from(container.querySelectorAll("button")).find(
      (item) => item.textContent === "清除当前效果",
    ) as HTMLButtonElement;

    await act(async () => {
      clearButton.click();
    });

    expect(container.textContent).toContain("生成最终效果");
    expect(container.querySelector(".train-preview-frame > img")).toBeNull();
    expect(container.textContent).not.toContain("等待生成最终效果");
    expect(container.textContent).toContain("方案1");

    await unmount(root, container);
  });

  it("places save and clear controls in the preview header instead of the chat input", async () => {
    const { container, root } = await renderPage("matching-proposal");

    await act(async () => {
      await Promise.resolve();
    });

    const headerButtonLabels = Array.from(
      container.querySelectorAll(".generation-preview-header button"),
    ).map((item) => item.textContent);
    expect(headerButtonLabels).toEqual(
      expect.arrayContaining(["保存方案", "清除当前效果"]),
    );

    const chatButtonLabels = Array.from(
      container.querySelectorAll(".chat-input-row button"),
    ).map((item) => item.textContent);
    expect(chatButtonLabels).toContain("微调当前方案");
    expect(chatButtonLabels).not.toContain("保存方案");
    expect(chatButtonLabels).not.toContain("清除当前效果");

    await unmount(root, container);
  });

  it("keeps archived proposal cards focused on deletion for now", async () => {
    vi.mocked(finalProposalApi.listArchivedProposals).mockResolvedValue([
      {
        id: "archived-1",
        projectId: "project-1",
        version: 3,
        name: "方案 V3",
        imageUrl: "/generated/final-proposals/archived-1.png",
        promptUsed: "测试提示词",
        designRationale: "测试说明",
        createdAt: "2026-05-27T10:37:26.000Z",
      },
    ]);

    const { container, root } = await renderPage();

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("已保存方案");
    expect(container.textContent).not.toContain("已归档方案及报告");
    expect(container.textContent).toContain("删除");
    expect(container.textContent).not.toContain("设为当前");
    expect(container.textContent).not.toContain("对比");

    await unmount(root, container);
  });
});

it('aborts generation on navigation and ignores its late result after the workspace changes',async()=>{
 let resolve!:(value:Awaited<ReturnType<typeof finalProposalApi.generateFinalProposal>>)=>void;
 vi.mocked(finalProposalApi.generateFinalProposal).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const {root,container,render}=await renderPage('none');
 try {
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='生成最终效果')!.click());
  const signal=vi.mocked(finalProposalApi.generateFinalProposal).mock.lastCall![0].signal!;
  await render(false); expect(signal.aborted).toBe(true);
  projectMock.currentProjectId='other-project';
  await act(async()=>resolve({id:'late-result',version:99,imageUrl:'/late.png',promptUsed:'p',designRationale:'r',createdAt:'now'}));
  await render(true);
  expect(container.querySelector('img[alt="最终高铁涂装方案"]')).toBeNull();
 }finally{projectMock.currentProjectId='project-1';await unmount(root,container);}
});
