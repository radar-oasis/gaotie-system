# 图谱约束需求理解 Implementation Plan

**Goal:** 接通已批准的模糊需求理解、真实图实体对齐和实体检索；修复大象/象以及象串入天象的问题。

**Architecture:** parse-intent读取真实母题与分类词表提供给现有模型，校验模型输出实体。结构化意象也经过解析但保留分组。检索层独立做真实实体识别和安全别名兜底；识别母题后不跨字段含字匹配。模型异常回退不阻断基础搜索。

**Tech Stack:** NestJS、Neo4j、React、Jest、Vitest。

- [ ] 在pattern-discovery.spec.ts补大象/象实体正反例；在解析测试验证真实词表、非法实体和保留分组。先运行失败测试。
- [ ] 新建pattern-entities.ts集中规范词、别名、模型输出校验；更新app.service.ts解析词表与降级，controller传结构化groups；不改数据库。
- [ ] 更新pattern-discovery.ts母题实体模式，关系命中优先，名称补充受控；保留分类、facet AND和分页。
- [ ] 更新ImageSearchPage与patternSearch：统一解析入口、保留组身份，解析失败采用已有分组兜底；补前端回归。
- [ ] 运行后端Jest、前端Vitest与构建，真实API验证大象/象不串类，检查服务更新。仅更新本地相关文件，不提交原有脏工作区。

验收：大象/象/象纹母题关联集合一致；龙云等分组仍独立；天象分类仍可检索；模型返回不存在的母题不作为已确认实体；未知词不自动扩大到全库；模型故障仍可识别常用别名。地域、总结与后续追问不在本轮范围。
