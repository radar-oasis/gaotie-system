# Human-AI Livery Workflow Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a thesis-ready HTML/SVG diagram showing the ideal knowledge-driven human-AI collaborative rail-transit livery design workflow.

**Architecture:** Create one self-contained HTML fragment in the thread visualization directory. The fragment contains a responsive inline SVG with seven horizontal stages, three responsibility lanes, stage outputs, decision gates, knowledge-support links, and typed feedback loops. No external data or network resources are required.

**Tech Stack:** HTML fragment, CSS, inline SVG, bundled visualization renderer, image inspection.

---

### Task 1: Create the semantic SVG structure

**Files:**
- Create: `/Users/lisensen/.codex/visualizations/2026/07/30/019fb381-a9ff-7da3-ba6c-265176d18d52/human-ai-livery-workflow.html`
- Reference: `/Users/lisensen/gaotie-system/docs/superpowers/specs/2026-07-30-human-ai-livery-workflow-visual-design.md`

- [ ] **Step 1: Create the HTML fragment root and accessibility metadata**

Use one root container and one SVG with a fixed academic landscape view box:

```html
<div id="human-ai-livery-workflow">
  <svg viewBox="0 0 2100 1220" role="img"
       aria-labelledby="livery-workflow-title livery-workflow-desc">
    <title id="livery-workflow-title">知识驱动的人机协同轨道交通工具涂装设计流程</title>
    <desc id="livery-workflow-desc">
      七阶段涂装设计流程，分别展示设计师职责、人工智能协同能力、
      数据与知识支持、阶段产物以及评价反馈闭环。
    </desc>
  </svg>
</div>
```

- [ ] **Step 2: Add SVG definitions**

Define neutral structural arrows plus distinct markers for forward process, data support, and feedback:

```html
<defs>
  <marker id="arrow-forward" markerWidth="10" markerHeight="10"
          refX="9" refY="5" orient="auto">
    <path d="M0,0 L10,5 L0,10 Z" class="arrow-forward-head"/>
  </marker>
  <marker id="arrow-support" markerWidth="10" markerHeight="10"
          refX="9" refY="5" orient="auto">
    <path d="M0,0 L10,5 L0,10 Z" class="arrow-support-head"/>
  </marker>
  <marker id="arrow-feedback" markerWidth="10" markerHeight="10"
          refX="9" refY="5" orient="auto">
    <path d="M0,0 L10,5 L0,10 Z" class="arrow-feedback-head"/>
  </marker>
</defs>
```

- [ ] **Step 3: Add the input and seven stage groups**

Use the exact stage labels:

```text
设计任务定义
文化语义解析
纹样知识映射
视觉基因提取与转化
车体涂装构建
多模态方案生成
评价、优化与输出
```

For every stage, add:

- a numbered heading;
- one designer-responsibility block;
- one AI-collaboration block;
- one data-support block;
- one stage-output label;
- forward arrows connecting adjacent stages.

- [ ] **Step 4: Add the responsibility lane labels**

Use stable category labels and symbols:

```text
设计师主导（橙色、实线人物标识）
AI 协同（蓝色、节点内标注 AI）
数据与知识支撑（绿色、虚线数据库标识）
阶段产物（中性灰）
```

- [ ] **Step 5: Add four human decision gates**

Place diamond gates after:

```text
文化方向确认
纹样筛选确认
车体方案确认
最终方案确认
```

The forward workflow must pass through each gate.

### Task 2: Add knowledge systems and feedback loops

**Files:**
- Modify: `/Users/lisensen/.codex/visualizations/2026/07/30/019fb381-a9ff-7da3-ba6c-265176d18d52/human-ai-livery-workflow.html`

- [ ] **Step 1: Add the persistent knowledge-support band**

Include these support sources and link them with dashed arrows to the relevant stages:

```text
车型参数与工程规范
地域文化与文化语义知识
中国传统纹样知识图谱
纹样转译方法与视觉样本
轨道交通涂装案例知识图谱
车体区域、布局与 CMF 规则库
多模态生成模型与提示模板
专家评价、用户偏好与项目历史
```

- [ ] **Step 2: Add stage outputs**

Show the following output chain below the main process:

```text
设计任务书
文化语义图谱
候选纹样集
可用视觉资产
车体涂装设计包
多方案效果图
最终方案、设计规范与过程档案
```

- [ ] **Step 3: Add the multidimensional evaluation panel**

Display these dimensions in one compact evaluation group:

```text
文化契合
视觉质量
车体适配
动态识别
创新与多样性
工程可实施性
控制感与可解释性
```

- [ ] **Step 4: Add typed feedback loops**

Create distinct feedback paths from the evaluation stage:

```text
文化偏差 → 文化语义解析
纹样表达不足 → 视觉基因提取与转化
布局、色彩或适配问题 → 车体涂装构建
生成一致性问题 → 多模态方案生成
目标变化 → 设计任务定义
```

Use feedback labels directly on the paths so the return logic does not depend on color.

### Task 3: Apply thesis-ready visual styling

**Files:**
- Modify: `/Users/lisensen/.codex/visualizations/2026/07/30/019fb381-a9ff-7da3-ba6c-265176d18d52/human-ai-livery-workflow.html`

- [ ] **Step 1: Add responsive layout CSS**

Use a transparent, unframed root and preserve the SVG aspect ratio:

```css
#human-ai-livery-workflow {
  width: 100%;
  color: var(--foreground);
}

#human-ai-livery-workflow svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}
```

- [ ] **Step 2: Apply theme-aware category styling**

Map categories consistently:

```css
.designer-node { fill: color-mix(in srgb, var(--viz-series-2) 16%, var(--card)); }
.ai-node { fill: color-mix(in srgb, var(--viz-series-1) 16%, var(--card)); }
.data-node { fill: color-mix(in srgb, var(--viz-series-3) 16%, var(--card)); }
.output-node { fill: var(--muted); }
.structural-line { stroke: var(--border); }
.support-line { stroke: var(--viz-series-3); stroke-dasharray: 7 6; }
.feedback-line { stroke: var(--viz-series-4); }
```

Pair each color with lane labels, line styles, node text, and icons.

- [ ] **Step 3: Prevent print and export defects**

Ensure:

- no text is smaller than the equivalent of 11 px at the intended preview width;
- node text wraps using explicit SVG text lines;
- no labels overlap arrows;
- feedback paths remain outside the main node area;
- the longest stage title fits without clipping;
- the design remains legible in grayscale through lane labels and line patterns.

### Task 4: Validate and visually inspect the demo

**Files:**
- Inspect: `/Users/lisensen/.codex/visualizations/2026/07/30/019fb381-a9ff-7da3-ba6c-265176d18d52/human-ai-livery-workflow.html`
- Create temporarily: `/private/tmp/human-ai-livery-workflow-preview.html`
- Create temporarily: `/private/tmp/human-ai-livery-workflow-preview.png`

- [ ] **Step 1: Run the literal-fragment checks**

Run:

```bash
rg -n '\\\\"|\\\\n|<!doctype|<html|<head|<body' \
  /Users/lisensen/.codex/visualizations/2026/07/30/019fb381-a9ff-7da3-ba6c-265176d18d52/human-ai-livery-workflow.html
```

Expected: no matches.

- [ ] **Step 2: Check required content**

Run:

```bash
rg -n '设计任务定义|文化语义解析|纹样知识映射|视觉基因提取与转化|车体涂装构建|多模态方案生成|评价、优化与输出|设计师主导|AI 协同|数据与知识支撑' \
  /Users/lisensen/.codex/visualizations/2026/07/30/019fb381-a9ff-7da3-ba6c-265176d18d52/human-ai-livery-workflow.html
```

Expected: every required label appears.

- [ ] **Step 3: Render the fragment**

Run:

```bash
/Users/lisensen/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  /Users/lisensen/.codex/plugins/cache/openai-bundled/visualize/1.0.12/skills/visualize/scripts/render.py \
  /Users/lisensen/.codex/visualizations/2026/07/30/019fb381-a9ff-7da3-ba6c-265176d18d52/human-ai-livery-workflow.html \
  /private/tmp/human-ai-livery-workflow-preview.html
```

Expected: a standalone preview file is produced without fragment errors.

- [ ] **Step 4: Inspect the rendered image**

Capture and inspect the preview at a wide desktop size. Verify:

- all seven stages are visible;
- all three responsibility lanes remain aligned;
- no text or arrows overlap;
- feedback loops are readable;
- the main forward flow dominates the figure;
- the figure remains suitable for a thesis page.

- [ ] **Step 5: Fix defects and repeat checks**

Apply local coordinate, wrapping, or spacing corrections in the fragment, then repeat Steps 1-4 until the visual passes.

### Task 5: Deliver the inline visualization

**Files:**
- Final: `/Users/lisensen/.codex/visualizations/2026/07/30/019fb381-a9ff-7da3-ba6c-265176d18d52/human-ai-livery-workflow.html`

- [ ] **Step 1: Return the visualization**

Use the exact directive:

```text
::codex-inline-vis{file="human-ai-livery-workflow.html"}
```

- [ ] **Step 2: State the interpretation boundary**

In one concise sentence, state that the figure represents the ideal method framework and includes capabilities planned beyond the current implementation.
