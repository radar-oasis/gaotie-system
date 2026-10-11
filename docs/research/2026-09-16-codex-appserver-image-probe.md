# Codex App Server 本地生图独立验证

## 结论

2026-09-16 在本机成功完成一次参考图片生图。验证的是本机当前登录态和版本，不代表线上、多用户、其他账号或长期稳定性已验证。没有修改现有系统的生图供应商，没有调用 Seedream 或显式使用 OpenAI API Key。

## 实测路径

- 二进制：`/Applications/ChatGPT.app/Contents/Resources/codex`，版本0.153.4。
- 独立进程，stdio JSON-RPC；独立临时工作目录，ephemeral线程、workspace-write沙箱、never审批策略。拒绝服务端额外工具/审批请求，没有扩大权限。
- `initialize` → `account/read`（仅记录accountType=chatgpt，不输出令牌或邮箱）→ `modelProvider/capabilities/read`（imageGeneration=true）→ `thread/start` → `turn/start`。
- 自动继承的编排模型为gpt-5.6-sol；这不是生图模型名称。图片事件本身未给出底层生图模型名称，不能从本次事件独立证实具体版本。
- 输入样本：`样本图片/L45.png`复制到临时目录作为localImage。要求保留可识别主体、黑色线条、白色背景、流线型平面元素，只生成一张，不画列车、不加文字。
- 指令限定内置图片工具，不调用shell、外部MCP、API脚本或修改项目源码；实际记录出现imageGeneration事件。

## 时间及产物

- 0.074秒：能力查询返回imageGeneration=true。
- 21.804秒：imageGeneration in_progress。
- 61.373秒：imageGeneration completed，无failure。
- 64.783秒：turn completed，无error。
- 返回savedPath及result，result长度779236字符；文件584426字节，2172×724 PNG。
- 图片：`/Users/lisensen/.codex/generated_images/01a0a970-c2a9-7533-bfd3-9b712188489a/exec-4df88867-b94a-4ffd-8ddd-75cb5275bed9.png`。
- 已打开核验为实际图案，不是文本/空文件；没有证明母题保真程度或相对Seedream质量优势。
- 验证脚本：`/tmp/gaotie-appserver-image-check.k819kb/probe.mjs`，临时文件可能被操作系统清理。进程在任务完成后已终止，无新增监听端口。

## 下一步集成边界

作为可选本地供应商，用任务队列桥接App Server，将reference与输出限定在任务目录，校验产物后导入现有画布。需要补齐登录过期、额度不足、取消、超时、并发和恶意输入隔离，不暴露通用App Server命令给网页。保留Seedream回退选项，但不自动重复计费切换。当前未完成这些产品集成。

参考：[App Server](https://developers.openai.com/codex/app-server)、[内置图片生成及额度](https://learn.chatgpt.com/docs/image-generation)。内置图像会使用Codex额度，本次没有量化扣除额度。地域和服务使用条件不会因为使用App Server而消失。
