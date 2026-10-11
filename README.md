# 高铁涂装人机协同设计系统

面向高铁涂装设计的研究原型，包含需求与意象分析、纹样检索与知识图谱、素材管理、配色、超级画布、三维布局及方案生成。

## 项目结构

- `gaotie-web/`：React、TypeScript、Vite 前端。
- `gaotie-server/`：NestJS 后端，集成 Neo4j、PostgreSQL 和 AI 服务。
- `docs/`：系统说明、设计与实施文档。
- `prototypes/`：交互原型。
- `样本图片/`、`布局元素/`：系统静态素材。

## 本地运行

使用兼容项目依赖的 Node.js 环境，在两个目录分别执行 `npm ci`。

后端：

```bash
cd gaotie-server
cp .env.example .env.local
# 配置 AI 服务密钥，以及所需的数据库连接参数
npm run start:dev
```

前端（另开终端）：

```bash
cd gaotie-web
npm run dev
```

后端默认端口为 `3000`。数据库、AI 服务和前端 API 地址需按运行环境配置；现有环境变量示例并非完整部署配置。

## 构建与测试

```bash
npm --prefix gaotie-server run build
npm --prefix gaotie-server test -- --runInBand
npm --prefix gaotie-web run build
npm --prefix gaotie-web test
```

## 数据与配置

仓库包含系统源码、项目文档及静态样本素材。密钥、`.env` / `.env.local`、依赖目录、构建产物、运行日志、数据库备份及生成结果保留在本地。`images/` 大型纹样图库、论文答辩资料和 `案例知识图谱信息/` 原始数据未纳入版本管理；在新环境运行完整检索功能前，需要另行配置数据库并准备对应图库。

`gaotie-server/` 在原开发环境中另有独立 Git 历史，本仓库将其当前源码作为普通目录收录，克隆本仓库即可获得前后端代码。
