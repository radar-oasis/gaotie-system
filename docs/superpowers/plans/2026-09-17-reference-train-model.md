# Reference Train Model Implementation Plan

**Goal:** 按用户提供的正视、侧视、透视三张图重建轻量交互模型，保留七区域布局与历史版本。

**Architecture:** reference-train-v2 独立模型标识；旧 generic-train-v1 原样保留。新模型以独立纵向轮廓定义车头曲面，使用贴合表面的玻璃、灯具、门框和面板分缝；七区使用逻辑坐标统一采样，渲染和拾取进行相同坐标映射。新建默认 v2，旧方案显式升级为未保存草稿，不改写历史图片。

**Tech Stack:** Three.js / React / Vitest / NestJS / Jest；现有 feature/super-canvas 工作目录，不移动或清理用户未提交改动。

## Task 1 — Compatibility contract
- [x] 后端 layout3d.ts/spec 接受两种模型标识，拒绝未知值；描述标明版本，不更改保存字段和图片校验。
- [x] 前端 Layout3DConfig 联合模型类型，默认 v2，旧模型渲染保持不变，载入列表支持两种。

## Task 2 — Reference geometry
- [x] trainGeometry.test.ts 先验证 v2 长宽比、独立玻璃/灯具/转向架、几何有限数值及 v1 兼容；运行 `npx vitest run src/components/layout3d` 观察新增断言失败。
- [x] 新增 referenceTrainGeometry.ts/referenceTrainProfile.ts；纵向逻辑 x 放大 1.65，宽高不变，保持两节。鼻尖圆钝、驾驶室有缓坡，车身肩部圆角，车顶连续。
- [x] 门窗和风挡用独立曲面与线框，不用粗糙顶点斑块；裙板加轮组开口，轮轴/悬挂/连接处有层次。细腰线边界采样继续精确落在几何上。

## Task 3 — Integration and verification
- [x] TrainViewport.tsx 镜头随模型长度调整，拾取将物理 x 转逻辑 x，导出与预览共用模型；三视图不可裁切。
- [x] Layout3DEditor.tsx 旧方案可显式升级并保存新版本，配置全保留，升级前不修改已选生图方案；增加升级回归测试。
- [ ] 浏览器检查白模侧视/正视/斜视与参考图的形态差异、七区交互、真实保存和恢复；不发起付费生图。
- [ ] 独立规格与质量复核；前端全套测试/构建与后端定向测试/构建，记录限制。无自动提交部署。

验收重点是参考图外观和交互质量，不把程序化外观重建宣称为工程尺寸复原。

## 当前验证（2026-09-17）

- 前端全套 37 suites / 194 tests 通过；后端模型及最终设计包 10 suites / 69 tests 通过；前端构建通过。三维按需加载包约 585 KB，仍有构建体积提醒。
- 独立规格和质量审查通过。修复了悬停重建整模型的性能问题，改为颜色缓冲更新；独立基准暖更新约 0.56–1.33 ms，原重建约 65–98 ms。新增模型尺寸/独立细节/有限顶点/旧版尺寸/高亮恢复/升级保留配置测试。
- 前后端本地服务已启动。浏览器当前显示登录页，已请用户登录；尚未完成模型截图对照、实际保存与重新打开的视觉验收，不宣称照片相似度已通过。
- 未覆盖旧模型或旧布局图片，未提交代码、部署或发起付费生图。
