# 纹样转换画布：提示词增强调研

日期：2026-09-16。范围：GitHub 官方项目、原始论文与当前本地代码。此次只调研，未修改画布业务代码、下载模型、上传参考图或调用付费生图服务。前一项检索优化保留在工作区，尚未最终验收。

## 结论与证据边界

建议做“参考纹样约束下的编辑指令增强”，而不是通用提示词扩写器。首期复用现有文本模型、提示词资产库和生成接口，增加少量领域模板、结构化增强结果、用户确认与长度/冲突校验；视觉理解仅作为按需能力处理本次选中的图片，不处理全库。

已核验项目功能及本地接入点；没有测过增强前后的实际图像质量，因此以下优先级是工程适配判断，不是效果排行榜。仓库有代码、演示或论文，不等于在中国传统纹样与车身素材场景已经有效。

研究决策：选择能够低成本嵌入现有 React/NestJS 画布的增强方式。假设：保留母题、明确变形动作、约束独立素材输出，比盲目追加摄影与美学词更合适。停止条件：覆盖产品工作流、文本重写、参考图编辑增强、训练式优化四类；至少三个独立官方实现；找到反例与本地限制；给出后续可证伪实验。资料覆盖度自评 8/10，缺口是本项目生成对照实验与设计师评价，不是已知准确率。

前置检索：复用本地《抽象设计需求到传统纹样的检索》报告中的设计师主导、图谱事实与推测分离原则。此次差集是用户已经选图后的编辑指令，不重复调研全库召回。

## 一、当前系统不是从零开始

1. [promptLibrary.ts](/Users/lisensen/gaotie-system/gaotie-web/src/components/superCanvas/promptLibrary.ts:266) 的 `getPromptPolishSuggestions` 目前只有三个触发方向：简约线描、翅膀细节、连续构图，最多返回两条固定建议。它不是模型改写，也没有完整的“速度感”形态转译。
2. [SuperCanvasPage.tsx](/Users/lisensen/gaotie-system/gaotie-web/src/components/superCanvas/SuperCanvasPage.tsx:1932) 已有“专业表达建议”的使用/追加按钮，但仅在没有提示词资产推荐时显示。后续增强入口不宜被资产推荐遮蔽。
3. [superCanvasApi.ts](/Users/lisensen/gaotie-system/gaotie-web/src/components/superCanvas/superCanvasApi.ts:15) 目前传递 prompt 与一张/多张参考图。画布能关联来源纹样和提示词资产，但这次生成请求没有传完整母题、材质、构图等信息。
4. [types.ts](/Users/lisensen/gaotie-system/gaotie-web/src/components/superCanvas/types.ts:66) 已有纹样来源字段及保存提示词、来源图片、生成结果的资产结构。可以扩展为原始输入/增强版本/用户修改/模型版本，而非另建一套素材管理。
5. [super-canvas.service.ts](/Users/lisensen/gaotie-system/gaotie-server/src/super-canvas/super-canvas.service.ts:141) 已支持参考图生成与后处理去背景。文本重写不会代替实际抠图，也不会让位图自动成为矢量文件。

两个必须先处理的局部约束：

- 即梦和 OpenAI-compatible 的独立素材路径都把拼接后的提示词限制为 800 个 JavaScript 字符单位。当前固定后缀占 289，用户正文仅剩 511；这是本地实现限制，不是供应商官方上下文上限。直接输出一大段“增强提示词”会被静默切断。[即梦拼接](/Users/lisensen/gaotie-system/gaotie-server/src/super-canvas/jimeng-client.ts:69)、[兼容接口拼接](/Users/lisensen/gaotie-system/gaotie-server/src/final-proposals/openai-image-client.ts:84)
- 固定后缀偏好填充图形并排斥纯轮廓，而前端简约建议却推荐线描。这是代码层面的指令冲突风险，尚不能据此断言某次生成失败的原因。用户明确选择线描时应调整默认约束，不能用增强文本与后缀互相抵消。

## 二、值得借鉴的项目

### Prompt Optimizer：优先借鉴交互与组织方式

[linshenkx/prompt-optimizer](https://github.com/linshenkx/prompt-optimizer) 不只是文字润色，当前 develop 已有图生图、多图、图像理解、模板和评估。最值得借鉴的是原始输入与优化结果对照、模板分场景、可保存的提示词资产。它是应用框架，增强能力来自所选模型。

重点代码：[图生图模板](https://github.com/linshenkx/prompt-optimizer/blob/develop/packages/core/src/services/template/default-templates/image-optimize/image2image/image2image-optimize.ts)、[图像理解服务](https://github.com/linshenkx/prompt-optimizer/blob/develop/packages/core/src/services/image-understanding/service.ts)、[图像评估模板](https://github.com/linshenkx/prompt-optimizer/blob/develop/packages/core/src/services/template/default-templates/evaluation/image/content.ts)。评估模板区分提示词诊断与真实执行结果，值得保留这种边界。

不建议整套嵌入：我们的画布、项目保存、参考图和生图接口已经存在；其通用参考图迁移也可能保留本项目希望去掉的器物背景。当前 develop 的 [LICENSE](https://github.com/linshenkx/prompt-optimizer/blob/develop/LICENSE) 标为 AGPL-3.0-only，复制代码前需要核查拟采用版本和分发方式，不能沿用旧介绍中的授权印象。

### Qwen-Image：优先借鉴“编辑重写”的实现路径

官方 [prompt_utils.py](https://github.com/QwenLM/Qwen-Image/blob/main/src/examples/tools/prompt_utils.py) 分开提供文本扩写和 `polish_edit_prompt(prompt, img)`：后者把图片及编辑需求交给视觉模型，强调原意、改动对象和参考关系。当前示例的编辑入口接收单图，不能仅因模板提到多图就认为该函数已经完整提供多图接口。

适合本项目的是“图像+简短需求→具体编辑指令”。不建议照搬文本扩写模板：其部分规则会补场景、选风格、追加电影感，也有中文模板去除否定表达的要求，可能削弱“不要改变颜色”等硬条件。代码采用 [Apache-2.0](https://github.com/QwenLM/Qwen-Image/blob/main/LICENSE)，具体服务/模型仍各自适用其条款。

### Hunyuan PromptEnhancer：最贴近的专用模型参考

[官方项目](https://github.com/Hunyuan-PromptEnhancer/PromptEnhancer) 同时提供文生图重写和图生图编辑增强；[图生图实现](https://github.com/Hunyuan-PromptEnhancer/PromptEnhancer/blob/main/inference/prompt_enhancer_img2img.py) 使用 Qwen2.5-VL 架构，根据图像和编辑指令改写并强调非编辑区域不变。说明它不是只会追加形容词的工具。

对我们应借鉴“保留/修改边界”和关键点对齐评价，而不是首期自部署专用大模型。它是另一套推理部署，未验证本机资源和项目适配；[社区许可证](https://github.com/Hunyuan-PromptEnhancer/PromptEnhancer/blob/main/LICENSE) 也不是 MIT/Apache 式的无差别替换。论文与通用评估不能证明传统纹样转化效果。

### Fooocus 与 Promptist：有价值的对照，不是首期主方案

[Fooocus expansion.py](https://github.com/lllyasviel/Fooocus/blob/main/extras/expansion.py) 用小型语言模型及词表扩写，适合理解快速补词；它不结合本次纹样图片。文件头对 Fooocus 外部使用列有非商业限制，应单独核查，不按整个仓库许可证推断。

[Microsoft Promptist](https://github.com/microsoft/LMOps/blob/main/promptist/README.md) 是为生图偏好训练提示词改写器的研究路线，发布模型针对 Stable Diffusion v1.4。它提醒我们：改写效果依赖下游生成器，而非语言本身“更专业”就一定更好。旧权重不宜直接用于当前生成链路。原始研究见 [Optimizing Prompts for Text-to-Image Generation](https://arxiv.org/abs/2212.09611)。

沿技术路线看，补视觉词、针对模型训练重写器、结合图片明确编辑边界，解决的是不同问题，并非越新的工具自动替代旧工具。本项目是“有来源的素材改造”，所以参考图编辑重写比从零构造漂亮场景更贴近任务。

## 三、结合项目的建议方案

建议链路：用户原话 + 当前选图及来源 → 结构化设计意图 → 领域规则补全 → 1–2 个可编辑候选 → 用户确认 → 模型适配后的实际发送文本 → 现有生图/后处理。

增强内容分四层，页面明确来源：

- 用户明确要求：更快、更流线、保留原色等，不自动改成别的偏好。
- 已知素材事实：已关联母题、真实图谱属性；未看图就不编具体爪数、羽片结构或文化寓意。
- 系统建议：横向延展、主方向、轮廓收束、线宽节奏、简化密度等，可删可改，不全变成硬约束。
- 输出规范：当前生成独立素材而非整车效果图；清晰轮廓、可后处理背景、不擅加文字水印。颜色和线描/填充应尊重用户选项。

“速度感”不能机械等同于加运动模糊：对于要放大、裁切、去背景的装饰素材，模糊可能损伤边缘。可提供“完整母题、轻度拉伸”和“更抽象、横向带状”两个方向，让用户选择转化强度。横向延展是车身侧面任务的建议，不是所有纹样的普适审美定律。

示意输入：“把这个龙纹变得更有速度感、流线型。”

示意增强（人工设计例子，并非模型实测输出）：

> 以参考图中的龙纹为基础，保留其可识别的主体形态与原有配色。将整体走势适度横向延展，统一主要曲线方向，减少零碎装饰，使尾部线条逐渐收束，用清晰的轮廓和疏密变化表达速度感。生成适合车身侧面排布的独立平面装饰元素，不生成列车、轨道或环境场景；背景保持纯净，便于后续去背景。

“横向延展、减少装饰、保留原色”中凡非用户指定的内容，都要作为新增建议标出；如果用户要求换色，原色锁定立即失效。若有多图，明确图1负责主体、图2负责线条风格，不能默认把所有图案融合。第一版不强制多轮问答，只有方向、主次关系等会显著改变结果时才询问。

## 四、实现范围建议，不是本轮已经实现

轻量首期：在现有“专业表达建议”位置增加固定可见的“优化提示词”入口；后端增加独立增强接口，复用文本模型调用能力。传当前输入、选图ID/顺序、已知母题及输出阶段。返回增强文本、新增建议、保留项和冲突提醒；用户点击应用后才替换，允许撤回与继续编辑。无需向量库、训练集或全库视觉标注。

工程护栏：约束优先级明确；模型调用超时/失败保留原文；输入或选图变化时丢弃旧增强结果；按预算压缩后校验保留项，不再静默截断；用户提供的文本/图片内容只当数据，不允许覆盖增强器指令。密钥在后端，参考图访问权限、大小和来源需校验。

按需视觉版：只在用户点击“结合参考图优化”时分析当前一两张图，可按图像哈希及模型版本缓存。这个成本范围与给一万多张素材补全视觉索引不同。若现有文本服务不支持图像，需要另配视觉服务，不能把 URL 交给普通文本模型就称为看图。

后期再考虑专用模型、多个生成结果自动评估或学习用户偏好。复用已保存提示词时优先同纹样/同任务，限制数量并标明来源，避免整段历史污染当前需求。

## 五、反证、验证与演进

部分修正初始“通用增强器即可复用”的假设：官方文本扩写会增加场景和风格，而本地素材任务需要去场景；现有后缀与线描建议还存在冲突。因此应复用交互和编辑机制，自行写领域规则，不直接套用通用元提示词。

核心判断：增强器的价值不是增加描述数量，而是保留用户想保留的部分、补足生成器必须知道的变化，并把这些决定交还给用户。可证伪条件：如果领域增强在配对实验中不能提升可用素材比例，或明显降低母题可识别性/用户意图一致性，就减少默认扩写、保留原始模式，而不是继续堆模板。

下一轮建议 10 个有代表性的纹样任务，每个含原始短提示词、固定模板、模型领域增强三种条件；保持生成模型版本、参考图、尺寸等一致，有 seed 则保持 seed，并做重复采样。评价实际图片：母题保真、指定形态变化、独立素材可用性、背景洁净与用户偏好，同时记录费用、耗时及二次修改。题材覆盖龙凤、植物、几何、连续纹样，至少包含“不要改颜色”“只改尾部”“多图参考”“保留文字”等反例。

不要用增强模型自己的文字评分宣称图像提升，也不要把一次漂亮结果归因于重写。单组少量样本只能作为试点；先验证是否值得启用，再决定模型和默认设置。

Evolution Note：未来复用的研究顺序应为“检查真实发送提示词和隐藏后缀 → 明确阶段产物 → 再选增强器”。本轮发现的 511 字符正文预算与线描冲突，属于比引入新模型更优先的接入条件。本报告归档在当前项目研究目录；未定位到明确配置的独立 LLM-Wiki，不向未知目录写入。
