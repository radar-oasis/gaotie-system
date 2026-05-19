# 高铁涂装设计系统数据库设计文档

日期：2026-05-19
状态：v1 草案，待确认后进入实现

## 1. 设计目标

本设计用于把当前本地运行的高铁涂装设计系统升级为可部署、可登录、可保存历史记录的公网系统。数据库需要支持：

- 用户注册、登录、退出和权限控制。
- 按用户保存设计项目、历史会话、已选意象、案例、布局、色彩和最终方案。
- 保存生成图、参考图、上传图等图片资产的访问地址和元数据。
- 与现有 Neo4j 图谱共存，不重建已有意象图谱和案例图谱。
- 支持后续部署到 Docker、云服务器和对象存储。

## 2. 总体数据架构

系统采用三类存储，各自承担不同职责。

| 存储 | 职责 | 数据生命周期 |
| --- | --- | --- |
| PostgreSQL | 用户、项目、会话、消息、方案、资产等业务数据 | 长期保存 |
| Neo4j | 现有意象图谱、纹样图谱、案例列车知识图谱 | 长期保存，偏知识检索 |
| Redis | 登录会话、验证码、短缓存、任务状态、限流 | 短期或可丢弃 |

推荐第一阶段新增 PostgreSQL，不把用户业务数据继续写入 Neo4j。Neo4j 保持“知识库”定位，PostgreSQL 负责“用户产生的数据”。这样边界清楚，后续登录、权限、历史记录和备份都会简单很多。

## 3. 设计原则

- 所有用户产生的数据都必须带 `user_id` 或通过 `project_id` 间接归属到用户。
- 项目是主要业务容器，一次高铁涂装设计流程对应一个 `projects` 记录。
- 会话、意象选择、案例选择、布局方案、色彩方案、画布素材、最终方案都归属于项目。
- 从 Neo4j 检索出来的意象和案例不直接复制整库，只保存用户当时选中的快照，防止图谱数据变动后历史方案失真。
- 图片文件本体第一阶段可以继续存服务器本地或挂载目录，数据库只保存 URL、路径、类型和元数据；第二阶段可迁移到 OSS/COS。
- Redis 不作为历史记录数据库，只保存短期状态。

## 4. 核心实体关系

```text
users
  1 ── n projects

projects
  1 ── n conversations
  1 ── n selected_patterns
  1 ── n selected_cases
  1 ── n layout_schemes
  1 ── n color_schemes
  1 ── n canvas_assets
  1 ── n final_proposals
  1 ── n assets

conversations
  1 ── n messages

assets
  1 ── n canvas_assets
  1 ── n final_proposals
```

## 5. 表设计

### 5.1 users

保存系统用户。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 用户 ID |
| email | text | unique, nullable | 邮箱登录时使用 |
| username | text | unique, nullable | 用户名登录时使用 |
| password_hash | text | not null | 密码哈希，使用 bcrypt/argon2 |
| display_name | text | nullable | 显示名称 |
| role | text | not null | `user`、`admin` |
| status | text | not null | `active`、`disabled` |
| last_login_at | timestamptz | nullable | 最近登录时间 |
| created_at | timestamptz | not null | 创建时间 |
| updated_at | timestamptz | not null | 更新时间 |

约束：

- `email` 和 `username` 至少一个不为空。
- 第一版可只启用 `username + password`，后续再启用邮箱。

### 5.2 projects

保存一次完整设计工作流。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 项目 ID |
| user_id | uuid | fk users.id | 所属用户 |
| name | text | not null | 项目名 |
| description | text | nullable | 项目说明 |
| status | text | not null | `draft`、`active`、`archived` |
| current_step | text | not null | 当前流程：`demand`、`image`、`case`、`layout`、`color`、`canvas`、`proposal` |
| metadata | jsonb | not null default `{}` | 预留扩展 |
| created_at | timestamptz | not null | 创建时间 |
| updated_at | timestamptz | not null | 更新时间 |
| archived_at | timestamptz | nullable | 归档时间 |

索引：

- `(user_id, updated_at desc)`
- `(user_id, status)`

### 5.3 conversations

保存不同模块中的会话，例如需求分析、案例检索、最终方案微调。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 会话 ID |
| project_id | uuid | fk projects.id | 所属项目 |
| user_id | uuid | fk users.id | 冗余归属，便于鉴权和查询 |
| module | text | not null | `demand`、`case_search`、`proposal_adjust` |
| title | text | nullable | 会话标题 |
| status | text | not null | `active`、`archived` |
| created_at | timestamptz | not null | 创建时间 |
| updated_at | timestamptz | not null | 更新时间 |

索引：

- `(project_id, module, updated_at desc)`
- `(user_id, updated_at desc)`

### 5.4 messages

保存用户与 AI 的每条消息。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 消息 ID |
| conversation_id | uuid | fk conversations.id | 所属会话 |
| project_id | uuid | fk projects.id | 所属项目 |
| user_id | uuid | fk users.id | 所属用户 |
| role | text | not null | `user`、`assistant`、`system` |
| message_type | text | not null | `text`、`rich_card`、`case_card`、`tool_result` |
| content | text | not null | 消息正文 |
| payload | jsonb | not null default `{}` | 标签、推荐卡片、案例列表等结构化内容 |
| model | text | nullable | 使用的模型，如 `deepseek-chat` |
| prompt_tokens | integer | nullable | 输入 token，可后续统计成本 |
| completion_tokens | integer | nullable | 输出 token |
| created_at | timestamptz | not null | 创建时间 |

索引：

- `(conversation_id, created_at)`
- `(project_id, created_at)`

### 5.5 demand_tags

保存需求分析阶段确认的设计意象标签。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 标签记录 ID |
| project_id | uuid | fk projects.id | 所属项目 |
| user_id | uuid | fk users.id | 所属用户 |
| label | text | not null | 标签名，如 `长城` |
| topic | text | nullable | 主题，如 `中国文化` |
| source_message_id | uuid | fk messages.id, nullable | 来源消息 |
| sort_order | integer | not null default 0 | 展示顺序 |
| created_at | timestamptz | not null | 创建时间 |

唯一约束：

- `(project_id, topic, label)`

### 5.6 selected_patterns

保存用户选中的意象图片快照。来源是 Neo4j 的 `Pattern` 节点，但这里保存用户选择时的关键字段。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 选择记录 ID |
| project_id | uuid | fk projects.id | 所属项目 |
| user_id | uuid | fk users.id | 所属用户 |
| neo4j_pattern_id | text | nullable | Neo4j 中的 Pattern_ID |
| name | text | not null | 意象名称 |
| image_url | text | not null | 图片 URL 或相对路径 |
| dynasty | text | nullable | 年代/朝代 |
| description | text | nullable | 描述 |
| carriers | jsonb | not null default `[]` | 载体快照 |
| materials | jsonb | not null default `[]` | 材质快照 |
| motifs | jsonb | not null default `[]` | 纹样快照 |
| layouts | jsonb | not null default `[]` | 组织形式快照 |
| sort_order | integer | not null default 0 | 展示顺序 |
| created_at | timestamptz | not null | 创建时间 |

唯一约束：

- `(project_id, neo4j_pattern_id)`，当 `neo4j_pattern_id` 不为空时生效。

### 5.7 selected_cases

保存用户选中的高铁案例快照。来源是 Neo4j 案例图谱。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 选择记录 ID |
| project_id | uuid | fk projects.id | 所属项目 |
| user_id | uuid | fk users.id | 所属用户 |
| neo4j_train_id | text | nullable | Neo4j 中的 Train id |
| title | text | not null | 案例名称 |
| image_url | text | nullable | 案例图片 |
| description | text | nullable | 系统描述 |
| user_description | text | nullable | 用户补充描述 |
| attributes | jsonb | not null default `{}` | 速度、国家、制造商等快照 |
| design_features | jsonb | not null default `{}` | 车窗带、色带、车头形态等特征快照 |
| sort_order | integer | not null default 0 | 展示顺序 |
| created_at | timestamptz | not null | 创建时间 |
| updated_at | timestamptz | not null | 更新时间 |

唯一约束：

- `(project_id, neo4j_train_id)`，当 `neo4j_train_id` 不为空时生效。

### 5.8 layout_schemes

保存布局元素配置。当前系统已有布局保存接口，第一阶段应迁移到 PostgreSQL 并增加用户与项目归属。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 布局方案 ID |
| project_id | uuid | fk projects.id | 所属项目 |
| user_id | uuid | fk users.id | 所属用户 |
| name | text | not null | 方案名 |
| components_map | jsonb | not null | 当前 `componentsMap` |
| preview_asset_id | uuid | fk assets.id, nullable | 预览图资产 |
| created_at | timestamptz | not null | 创建时间 |
| updated_at | timestamptz | not null | 更新时间 |

索引：

- `(project_id, updated_at desc)`

### 5.9 color_schemes

保存色彩方案。当前系统把色彩方案写入 Neo4j，后续建议迁移到 PostgreSQL。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 色彩方案 ID |
| project_id | uuid | fk projects.id | 所属项目 |
| user_id | uuid | fk users.id | 所属用户 |
| layout_scheme_id | uuid | fk layout_schemes.id, nullable | 对应布局方案 |
| name | text | not null | 色彩方案名 |
| layout_components_map | jsonb | not null default `{}` | 布局组件快照 |
| regions | jsonb | not null | 施色域 |
| palette | jsonb | not null default `[]` | 调色板 |
| created_at | timestamptz | not null | 创建时间 |
| updated_at | timestamptz | not null | 更新时间 |

索引：

- `(project_id, updated_at desc)`
- `(layout_scheme_id, updated_at desc)`

### 5.10 assets

统一保存图片资产和文件元数据。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 资产 ID |
| project_id | uuid | fk projects.id, nullable | 所属项目；公共素材可为空 |
| user_id | uuid | fk users.id, nullable | 所属用户；公共素材可为空 |
| asset_type | text | not null | `pattern`、`case`、`layout_element`、`upload`、`canvas_generated`、`final_proposal`、`reference` |
| storage_provider | text | not null | `local`、`oss`、`cos`、`external` |
| bucket | text | nullable | 对象存储 bucket |
| object_key | text | nullable | 对象存储 key 或本地相对路径 |
| public_url | text | not null | 对外访问 URL |
| mime_type | text | nullable | MIME 类型 |
| size_bytes | bigint | nullable | 文件大小 |
| width | integer | nullable | 图片宽 |
| height | integer | nullable | 图片高 |
| checksum | text | nullable | 内容哈希，用于去重 |
| metadata | jsonb | not null default `{}` | 生成任务 ID、来源 URL 等 |
| created_at | timestamptz | not null | 创建时间 |

索引：

- `(project_id, created_at desc)`
- `(asset_type, created_at desc)`
- `(checksum)`，当需要去重时使用。

### 5.11 canvas_assets

保存超级画布中的素材层、抠图结果和画布状态引用。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 画布素材 ID |
| project_id | uuid | fk projects.id | 所属项目 |
| user_id | uuid | fk users.id | 所属用户 |
| asset_id | uuid | fk assets.id, nullable | 对应图片资产 |
| name | text | nullable | 素材名 |
| image_url | text | not null | 图片 URL，兼容现有前端 |
| prompt | text | nullable | 生成提示词 |
| layer_state | jsonb | not null default `{}` | 位置、缩放、旋转、透明度等 |
| generation | jsonb | not null default `{}` | 即梦任务、置信度、透明像素比例等 |
| created_at | timestamptz | not null | 创建时间 |
| updated_at | timestamptz | not null | 更新时间 |

索引：

- `(project_id, updated_at desc)`

### 5.12 final_proposals

保存最终方案、迭代版本和归档结果。替代当前后端内存 `Map`。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 方案 ID |
| project_id | uuid | fk projects.id | 所属项目 |
| user_id | uuid | fk users.id | 所属用户 |
| parent_id | uuid | fk final_proposals.id, nullable | 上一版方案 |
| version | integer | not null | 版本号 |
| name | text | not null | 方案名 |
| image_asset_id | uuid | fk assets.id, nullable | 生成图片资产 |
| image_url | text | not null | 图片 URL，兼容现有前端 |
| task_id | text | nullable | 即梦任务 ID |
| prompt_used | text | not null | 实际提示词 |
| user_instruction | text | nullable | 用户微调指令 |
| design_rationale | text | nullable | 设计说明 |
| package_snapshot | jsonb | not null | 最终方案生成时的完整输入快照 |
| reference_image_urls | jsonb | not null default `[]` | 参考图 URL |
| status | text | not null | `generated`、`archived`、`deleted` |
| created_at | timestamptz | not null | 创建时间 |
| updated_at | timestamptz | not null | 更新时间 |
| deleted_at | timestamptz | nullable | 软删除时间 |

索引：

- `(project_id, created_at desc)`
- `(user_id, created_at desc)`
- `(parent_id)`

### 5.13 generation_jobs

保存图片生成任务状态，便于长任务和失败重试。第一版可先建表，后续再接队列。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 内部任务 ID |
| project_id | uuid | fk projects.id | 所属项目 |
| user_id | uuid | fk users.id | 所属用户 |
| job_type | text | not null | `super_canvas`、`final_proposal`、`proposal_iteration` |
| provider | text | not null | `jimeng` |
| provider_task_id | text | nullable | 第三方任务 ID |
| status | text | not null | `queued`、`running`、`succeeded`、`failed`、`cancelled` |
| input | jsonb | not null | 任务输入 |
| output | jsonb | not null default `{}` | 任务输出 |
| error_message | text | nullable | 错误信息 |
| created_at | timestamptz | not null | 创建时间 |
| updated_at | timestamptz | not null | 更新时间 |
| completed_at | timestamptz | nullable | 完成时间 |

索引：

- `(user_id, created_at desc)`
- `(project_id, created_at desc)`
- `(status, created_at)`

### 5.14 audit_logs

记录关键操作，第一版可只记录登录、删除、归档、生成失败等事件。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | pk | 日志 ID |
| user_id | uuid | fk users.id, nullable | 操作用户 |
| project_id | uuid | fk projects.id, nullable | 相关项目 |
| action | text | not null | 操作类型 |
| target_type | text | nullable | 目标类型 |
| target_id | uuid | nullable | 目标 ID |
| ip_address | text | nullable | 请求 IP |
| user_agent | text | nullable | 浏览器信息 |
| metadata | jsonb | not null default `{}` | 扩展信息 |
| created_at | timestamptz | not null | 创建时间 |

索引：

- `(user_id, created_at desc)`
- `(project_id, created_at desc)`
- `(action, created_at desc)`

## 6. Redis 设计

Redis 用于短期状态，不保存不可丢失的数据。

| Key | 类型 | TTL | 说明 |
| --- | --- | --- | --- |
| `session:{sessionId}` | hash/string | 7-30 天 | 登录会话或刷新令牌状态 |
| `user_sessions:{userId}` | set | 与 session 同步 | 用户当前登录设备 |
| `rate_limit:{ip}:{route}` | string/counter | 1-60 分钟 | 接口限流 |
| `captcha:{target}` | string | 5-10 分钟 | 邮箱/手机验证码，第一版可不用 |
| `job_status:{jobId}` | hash/string | 1-24 小时 | 图片生成任务短期状态 |
| `cache:image_search:{hash}` | string/json | 5-30 分钟 | 意象检索缓存 |
| `cache:case_search:{hash}` | string/json | 5-30 分钟 | 案例检索缓存 |

登录策略建议：

- 第一版使用 JWT access token + Redis refresh/session。
- access token 有效期 15-60 分钟。
- refresh token 或 session 有效期 7-30 天。
- 退出登录时删除 Redis 中的 session。

## 7. Neo4j 边界

保留 Neo4j 中已有数据：

- 意象图片检索相关：`Pattern`、`Motif`、`Material`、`Dynasty`、`Carrier`、`Layout`。
- 案例检索相关：`Train` 及其特征关系。

不建议继续写入 Neo4j 的用户业务数据：

- 用户账号。
- 历史会话。
- 已选素材。
- 用户保存的布局/色彩/最终方案。

例外情况：

- 如果后续需要做“用户偏好图谱”或“设计方案知识图谱”，可以新建独立 Neo4j 图谱或标签，但不作为第一阶段目标。

## 8. 文件与图片资产策略

第一阶段：

- 本地图片目录继续由后端静态服务暴露，例如 `/images/`、`/sample-images/`、`/layout-elements/`、`/generated/...`。
- PostgreSQL `assets.public_url` 保存可访问 URL 或部署域名下的相对路径。
- `storage_provider = local`。

第二阶段：

- 将 `images/`、`样本图片/`、`布局元素/`、`generated/` 迁移到 OSS/COS。
- `assets.storage_provider` 改为 `oss` 或 `cos`。
- `assets.object_key` 保存对象存储路径，`assets.public_url` 保存 CDN/自定义域名访问地址。
- Neo4j 中已有图片路径可以保留原字段，但后端返回前统一转换为公网 URL。

## 9. 典型业务流程

### 9.1 用户登录

1. 用户提交用户名和密码。
2. 后端查询 `users`。
3. 校验 `password_hash`。
4. 创建 Redis session 或 refresh token。
5. 返回 access token 和用户基础信息。
6. 后续请求通过鉴权中间件得到 `user_id`。

### 9.2 新建项目

1. 用户点击新建项目。
2. 后端创建 `projects`。
3. 自动创建需求分析会话 `conversations(module = demand)`。
4. 前端进入当前项目工作流。

### 9.3 保存需求分析历史

1. 用户发送需求消息，写入 `messages(role = user)`。
2. 后端调用 DeepSeek。
3. AI 回复写入 `messages(role = assistant)`。
4. 解析出的标签写入 `demand_tags`。

### 9.4 保存意象图片选择

1. 后端从 Neo4j 查询 Pattern。
2. 用户选择图片。
3. 后端把 Pattern 的关键字段快照写入 `selected_patterns`。
4. 后续最终方案使用该快照，不依赖 Neo4j 当前值。

### 9.5 保存案例选择

1. 后端从 Neo4j 案例图谱查询 Train。
2. 用户选择案例并填写补充描述。
3. 后端写入 `selected_cases`，不再修改 Neo4j 中的 Train 节点。

### 9.6 保存最终方案

1. 后端生成图片，先写入文件系统或对象存储。
2. 创建 `assets(asset_type = final_proposal)`。
3. 创建 `final_proposals`，保存 `image_url`、`prompt_used`、`package_snapshot`。
4. 如果是微调版本，设置 `parent_id` 指向上一版。

## 10. 权限与数据隔离

- 普通用户只能访问自己的 `projects` 和项目下所有数据。
- 每个业务查询都必须带 `user_id` 校验。
- 管理员可以查看全局项目列表和系统日志，但第一版可以先不做管理员界面。
- 删除项目默认软删除：`projects.status = archived` 或相关表写入 `deleted_at`。
- 最终方案删除默认软删除，避免误删图片和历史。

## 11. 初始枚举值

```text
users.role: user, admin
users.status: active, disabled
projects.status: draft, active, archived
projects.current_step: demand, image, case, layout, color, canvas, proposal
conversations.module: demand, case_search, proposal_adjust
messages.role: user, assistant, system
messages.message_type: text, rich_card, case_card, tool_result
assets.asset_type: pattern, case, layout_element, upload, canvas_generated, final_proposal, reference
assets.storage_provider: local, oss, cos, external
generation_jobs.status: queued, running, succeeded, failed, cancelled
```

## 12. 迁移计划

### 阶段一：基础持久化

- 新增 PostgreSQL 和迁移工具。
- 新增 `users`、`projects`、`conversations`、`messages`。
- 实现账号密码登录。
- 把需求分析聊天记录保存到数据库。

### 阶段二：设计流程持久化

- 新增并接入 `demand_tags`、`selected_patterns`、`selected_cases`。
- 把前端 Context 中的关键状态同步到后端。
- 当前项目刷新后可恢复。

### 阶段三：方案与资产持久化

- 新增并接入 `assets`、`canvas_assets`、`final_proposals`、`generation_jobs`。
- 替换当前最终方案内存仓库。
- 生成图、归档图、微调历史可长期保存。

### 阶段四：部署与对象存储

- 统一公网 URL。
- 把图片目录迁移到 OSS/COS。
- 增加备份策略和恢复脚本。

## 13. 备份与恢复

第一阶段至少需要备份：

- PostgreSQL 数据库。
- Neo4j 数据库。
- 本地图片目录：`images/`、`样本图片/`、`布局元素/`、`gaotie-server/generated/`。
- `.env` 不进入代码仓库，应单独安全备份。

建议：

- PostgreSQL 每日自动 `pg_dump`。
- Neo4j 每日或每周 dump。
- 图片目录每日增量同步到对象存储或备份盘。
- 上线后保留最近 7 天每日备份、最近 4 周每周备份。

## 14. 第一版实现建议

推荐第一版只实现这些最小闭环：

1. 账号密码登录。
2. 用户新建/切换项目。
3. 需求分析聊天历史保存。
4. 意象选择、案例选择、布局、色彩保存到项目。
5. 最终方案归档从内存改为 PostgreSQL。
6. Redis 只做 session 和简单限流。

暂不做：

- 复杂团队协作。
- 公开分享链接。
- 支付或计费。
- 多角色权限细分。
- 用户偏好图谱。

这能让系统先具备正式部署所需的核心能力：登录、隔离、可恢复、可追溯、可备份。
