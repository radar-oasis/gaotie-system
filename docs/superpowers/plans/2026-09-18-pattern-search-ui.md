# Pattern Search UI Implementation Plan

> 本次按用户“先实现一版”授权在当前工作区顺序执行，保留已有未提交改动，不提交或推送。执行方式：executing-plans；交互测试先行。

**Goal:** 将已确认的纹样检索视觉与卡片交互落地，供用户直接试用。

**Architecture:** 保持 grouped-query 契约不变；ImageSearchContext 增加独立 searchInput 并兼容旧快照。拆分 PatternCard 与 PatternLightbox；IntentDialogue 改为顶部输入及可折叠依据；页面级 CSS 限定样式范围。TopNav 增加本页侧栏形态，其他模块沿用原导航。

**Tech Stack:** React 19、TypeScript、TDesign 图标、CSS、Vitest/happy-dom。

## 1. 先写交互回归测试

- [x] PatternGallery.test.tsx：独立选择、预览、详情翻面/移出恢复、键盘/缩放/关闭、缺失资料与失败图片测试。
- [x] IntentDialogue.test.tsx：依据默认收起，输入法 Enter 不提交、发送自然语言、保留已选标签自动检索。
- [x] TopNav.test.tsx：侧栏全部入口、图标、案例入口；ImageSearchPage.test.tsx：保留取消与并发请求测试。
- [x] 运行聚焦测试并确认新增断言因尚未实现而失败。

## 2. 页面与组件

- [x] 新增 PatternCard.tsx，独立图片区/选择按钮/意象信息入口；CSS 双面翻转，mouse leave / blur / Escape 恢复。
- [x] 新增 PatternLightbox.tsx，独立 modal、焦点约束、关闭恢复、缩放及图片失败反馈。
- [x] 修改 PatternGallery.tsx，保留分组/直接与相关/分页/更多及数据去重，替换旧内联布局。
- [x] 修改 IntentDialogue.tsx 为原生多行输入，折叠依据只列已返回结构化检索条件和图谱匹配理由，不呈现模型内部推理。
- [x] 修改 SelectedPatternsList.tsx 及 ImageSearchPage.tsx，完成主内容/右栏布局与局部主题。
- [x] 修改 TopNav.tsx 与 App.tsx，纹样页使用侧栏，其他页原状；确认按钮实际切换 canvas。
- [x] 新增 PatternSearch.css，响应式、焦点、减少动画、滚动边界。

## 3. 验证与交付

- [x] 聚焦交互测试通过。
- [x] VITE_API_BASE_URL=http://localhost:3000 npm test：200 通过；构建通过；ESLint 无错误，原有保存组件 1 项依赖警告。
- [x] 本地真实页面验证检索、选择、翻面/移出、大图缩放/关闭及进入画布；截图检查桌面，390px 无水平溢出；取消操作有自动化覆盖。
- [x] 自审及独立代码审查；修复输入跨模块丢失，新增两项测试；更新规范中验收结果与已知限制。
