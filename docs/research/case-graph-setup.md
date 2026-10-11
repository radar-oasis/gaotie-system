# 案例图谱启动与检查

后端启动前会分别检查纹样图谱和案例图谱。案例库不就绪时，检索会快速返回具体状态；页面提供“重新检查”和“跳过案例，继续效果生成”。案例不是生成必填项。

在 `gaotie-server/.env.local` 设置（不要提交实际密码）：

```
NEO4J_CASE_URI=bolt://127.0.0.1:7688
NEO4J_CASE_USER=neo4j
NEO4J_CASE_PASSWORD=your-password
# 可选，仅在 Neo4j 支持对应数据库时填写
# NEO4J_CASE_DATABASE=neo4j
```

可使用独立实例，也可把案例数据导入现有实例并将 URI 指向它。案例查询使用 `Train` 标签，纹样查询使用 `Pattern` 标签。不要把“连接成功”误当作“已有案例”；健康检查也检查 Train 数量。

从仓库根目录：

```
npm --prefix gaotie-server run build
cd gaotie-server
node scripts/import-case-data.cjs
node scripts/case-preflight.cjs
npm run start:prod
```

导入脚本使用系统 Python 3 的 CSV 解析器，读取仓库 `案例知识图谱信息/Nodes.csv` 和 `Edges.csv`，在一个事务中按 ID 增量更新，不清空数据库。图片来自 `样本图片`，后端以 `/sample-images/` 提供。再次执行不会重复节点/关系。

2026-10-09 本机配置使用现有 `127.0.0.1:7687`，导入 238 个节点、1231 条有效关系（CSV 中 1 条关系指向缺失的 Country_中国香港，明确跳过并在导入结果报告），其中 81 个 Train。配置和凭据仅保存在被 Git 忽略的 `.env.local`。

`GET /case-search/health` 返回 `ready / not_configured / unavailable / empty`；搜索前先检查依赖，不可用时不调用语言模型。连接等待最多 2.5 秒，图查询最多 4 秒，意图扩展 3.5 秒超时后回到本地关键词。前端请求 12 秒有界等待。
