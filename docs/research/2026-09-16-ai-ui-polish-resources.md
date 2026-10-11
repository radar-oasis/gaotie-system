# AI辅助UI美化资源初筛

日期：2026-09-16。范围：为现有高铁设计工作台寻找设计指导、主题与可复用组件；不安装、不修改业务代码。基于官方仓库和文档的能力初筛，尚未在本项目进行集成或设计效果对比测试。

## 结论

优先试用设计指导类，而非立即替换组件库：项目当前依赖React 19、Vite、TDesign，具备Tailwind依赖。Impeccable或UI UX Pro Max可作为设计指导候选；shadcn、tweakcn与Magic UI可提供参考或局部组件，但不能直接当作TDesign换肤包。

判断依据：现有系统已具备工作流和业务组件，统一层级、间距、配色、密度及状态反馈，预计比混入多个视觉组件库更容易控制改造范围。这是工程适配判断，非已验证的用户体验结论。若用户希望整体迁移设计系统，应重新比较迁移成本。

## 候选与边界

|候选|官方资料所示能力|适用性判断与边界|
|---|---|---|
|[Impeccable](https://github.com/pbakaus/impeccable)|Apache-2.0；面向编码助手的设计指导，包含critique、audit、polish、layout、typeset等流程|优先试验已有界面的层级与细节优化；不是无需检查的一键美化器|
|[UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)|MIT；设计系统建议，风格、配色、字体及UX规则|适合先形成一致的视觉规范；中文字体与复杂工作台密度需要另行验证|
|[shadcn/ui](https://github.com/shadcn-ui/ui)|开放可定制组件；[官方MCP](https://ui.shadcn.com/docs/mcp)支持搜索和安装注册表组件|可参考侧栏、表单、标签页等；替换现有TDesign不是零成本|
|[tweakcn](https://github.com/jnsahaj/tweakcn)|可视化shadcn/Tailwind主题编辑器；[网站AI入口](https://tweakcn.com/editor/theme?p=custom&tab=ai)|适合比较配色、字体与主题；生成主题需映射到现有组件体系，在线AI费用未核实|
|[Magic UI](https://github.com/magicuidesign/magicui)|MIT；可复制使用的动画组件及效果；[组件预览](https://magicui.design/docs)|适合少量反馈与展示细节，不建议在素材检索和画布区堆叠装饰动效|
|[21st MCP](https://21st.dev/mcp)|组件检索、获取与在线生成入口；[旧Magic仓库](https://github.com/21st-dev/magic-mcp)现为兼容代理|是开源接入与托管服务的组合，不是已核实可完整免费自托管的生成系统；AI权限与组件访问权限不同|

[Mobbin](https://mobbin.com/)作为真实产品界面与流程参考库补充，不列为开源代码或自动美化工具。

## 建议验证方法

选择纹样检索一个页面，保留接口、分组召回、分页和选图逻辑，仅改视觉与交互呈现；对比改造前后不同屏幕宽度下的图片浏览面积、文字可读性、分组辨识和选图操作。避免同时启用多个相互冲突的设计技能，也不因工具宣传或星数推断效果。

## 证据与修正

本地文档未检索到这组候选的既有选型记录。官方仓库核实了各项目定位，但未做安装、安全审计、性能测量或付费服务测试。修正初始候选称谓：Magic MCP已迁移为21st MCP，旧仓库公开不代表完整托管服务开源免费。

Evolution Note：下次选型应分别判断设计指导、代码组件、主题编辑和在线生成四种能力；先识别既有组件体系，再评价复用成本。发现资源不等于应立即安装，示例好看也不等于适合设计工作台。
