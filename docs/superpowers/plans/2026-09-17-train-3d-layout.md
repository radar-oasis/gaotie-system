# Train 3D Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** 七类可编辑灰阶区域、两节通用高铁三维预览、版本化保存与实际生图参考联动。

**Architecture:** 前端纯配置/表面采样函数为三维材质、导出和文字提供一致规则；Three.js负责几何、拾取和固定视角导出。扩展现有LayoutScheme的layout3d字段，后端校验持久化图像，最终设计包使用三视图替代旧组件图。保留二维入口，不重写现有配色画布。

**Tech Stack:** React/TypeScript/Vite、Three.js、NestJS/Neo4j、Vitest/Jest。

当前用户已授权直接执行，沿用现有feature/super-canvas工作目录以保留正在使用的未提交功能，不切换或清理工作树，不自动提交。按规划、TDD和独立审查执行，不再重复请求方案批准。

## 契约

```ts
interface Layout3DConfig {
  version: 1; model: 'generic-train-v1';
  windowBand: { mode: 'none'|'long'|'short'; crossDoors: boolean };
  doors: 'inherit'|'full'|'upper'|'white';
  waist: { mode: 'none'|'single'|'double'; width: 'thin'|'medium'|'wide'; crossDoors: boolean };
  nose: 'none'|'full'|'upper'|'lower'|'front';
  roofSide: 'none'|'narrow'|'wide';
  lowerSide: 'none'|'narrow'|'wide';
  skirt: boolean;
}
interface Layout3DData {
  config: Layout3DConfig;
  views: { view: 'side'|'front'|'perspective'; imageUrl: string }[];
}
// LayoutScheme.layout3d?: Layout3DData
// save提交views.imageUrl为PNG data URL，返回持久化相对URL；三维componentsMap={}。
```

## Task 1: 纯配置与模型

Files: gaotie-web/src/components/layout3d/{layout3d.ts,layout3d.test.ts,trainGeometry.ts,TrainViewport.tsx}

- [x] 先写并运行失败测试：两车配置、窗带跨门/避门、门独立覆盖、玻璃保护、腰线单双、窗上/窗下宽窄、裙板开关、车头正侧差异；npm test -- src/components/layout3d/layout3d.test.ts。
- [x] 实现默认全白配置、可描述选项、表面区域采样与统一灰阶；规则优先级遵循设计文档。构建流线头车+普通车厢，窗门轮组可辨识。
- [x] 接入悬停/点击、拖拽抑制点击、视角预设和WebGL失败提示；导出冻结配置的三视图且不含编辑高亮，释放资源。
- [x] 单元测试和npm run build通过。

## Task 2: 后端持久化与最终设计包（独立后端子任务）

Files: gaotie-server/src/layout3d.ts及tests、app.service.ts、app.controller.ts、final-proposals/*、main.ts必要静态资源映射。

- [x] Jest先失败验证配置枚举/版本、恰好三视图、图像安全与大小、保存恢复字段、旧方案兼容、三维提示不强制长带、所有提供方附图、缺图先失败。
- [x] 保存先校验PNG与配置、持久化资源再写方案；失败无成功响应。限制本地资源路径，不接受任意外部引用替代保存上传。
- [x] 新layout3d替代旧组件参考图但不覆盖纹样/配色输入；prompt含七类人类可读描述和灰阶非最终色彩约束，仍执行参考图上限。
- [x] npm test -- --runInBand与npm run build；不调用付费生图、不删除数据库原记录。

## Task 3: 编辑与保存界面（主任务）

Files: layout3d/{Layout3DEditor.tsx,Layout3DEditor.css,Layout3DEditor.test.tsx}、LayoutElementsPage.tsx、ColorConfigContext.tsx、finalInputFingerprint.ts、DesignInputPipeline.tsx。

- [x] 先写失败测试验证七个区域、载入/新版本保存、导出失败不提交、项目切换取消旧响应、输入指纹响应每个区域变化。
- [x] 三维编辑默认入口，旧二维完整保留；左侧区域、中心模型、右侧形式，底部保存版本。已保存配置与草稿分开，未保存提示，名称可编辑。
- [x] 共享LayoutScheme新增layout3d类型；最终页面展示版本与三视图，指纹与归档包含配置；旧二维读取不丢新字段。
- [x] 运行前端全部测试与构建。

## Task 4: 集成与独立审查

- [x] 规格审查与代码质量审查，发现问题先补回归再修复。
- [x] 浏览器检查真实3D正侧斜视、七区域可见区别、模型只有两节；固定视角导出与恢复一致。仅模拟生图验证请求包。
- [x] 本地服务运行新版本，报告验证结果及实际限制；更新计划完成记录。

## 验收记录（2026-09-17）

- 前端：37 套 / 189 项测试通过；TypeScript + Vite 构建通过；修改的三维/最终输入文件定向 ESLint 无错误或警告。
- 后端：39 套 / 346 项测试通过（`npm test -- --runInBand --testTimeout=20000`）；Nest 构建通过。默认 5 秒测试阈值下，旧二维图片着色用例在本机发生超时，未修改业务逻辑掩盖；延长阈值后通过。
- 独立规格/质量审查通过。审查期间修复草稿恢复、面板高亮、鼻部范围、窗上窄幅、转化素材传递与腰线实际网格采样，并补回归测试。
- 未选色板默认黑白灰，但本次明确文字颜色优先；前后端提示一致，并补充无色板蓝窗带/金腰线的提示词回归。
- 本地浏览器实际保存两份测试版本，最新选用「三维布局验收 · 清晰双线」。配置七区域均有选择；保存的侧视/正视/斜视 PNG 使用后端持久 URL，最终输入页均正常加载。
- 刷新可恢复已选版本；切到另一项目的布局列表为 0 个并恢复白模，返回后原版本仍存在；未删除现有方案、未调用任何付费生图。
- 三维包按需加载，构建仍提示该单独 chunk 约 569 KB（gzip 144 KB）。通用程序化示意模型非工程精模；生成模型对区域边界的遵循仍须以后通过实际出图评估，不声称已验证最终图像质量。
