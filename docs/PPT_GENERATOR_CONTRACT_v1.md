# PPT Generator Contract v1

## 0. Phase 4 状态

**Phase 4 — PPT Generator**

**Contract v1 — Frozen**

后续实现必须遵循 Contract v1。只有真实开发或病例验收发现 Contract 无法支持时才可修改；不得因 UI 美观或实现方便任意改变 Contract。

本 Contract 仅定义 Phase 4 的输入、内容与确定性排版边界；不实现 PPT 页面、文件生成、数据库迁移或 Phase 1–3 逻辑变更。

核心决策：

- 单页病例 PPT；
- 学术交流 / 病例展示两种类型；
- 医生选择时间点和图片；
- AI 文本压缩为可选增强，不是 MVP 必经步骤；
- 图片使用基于规则的排版；
- MVP 只支持口内照片的 `intraoral_standard_3` 与
  `intraoral_standard_5`；
- 前牙美学修复病例的 `case_showcase` 可使用受限的 2 时间点 × 1
  `intraoral_frontal` 治疗前后对比；
- 面部、其他、mixed layout 与通用数量 fallback 属于 Out of Scope /
  Future Extension；
- 不提供 AI 临床建议。

## 1. 产品目标

MVP 生成两类单页病例 PPT：

| `ppt_type` | 中文 UI | 默认推荐病例状态 | 内容重点 |
| --- | --- | --- | --- |
| `academic_discussion` | 学术交流 | 治疗中 | 病例照片、当前状态、已完成治疗阶段/处理、可选医生讨论问题 |
| `case_showcase` | 病例展示 | 已结束 | 病例照片、治疗过程、最终情况、可选其他总结 |

病例状态只决定默认推荐类型，不是生成权限限制。

## 2. 现有项目字段映射

| Contract 概念 | Existing project field / 规则 | 说明 |
| --- | --- | --- |
| `case_id` | `cases.id` | 病例主键。 |
| 病例编号 | `cases.case_code` | 展示用，不替代 `case_id`。 |
| 病例状态 | `case_timepoints.is_final`，且时间点需 `completed_at` 非空 | 当前没有 `cases` 级状态字段；存在已完成且 `is_final = true` 的时间点即治疗已结束。 |
| `timepoint_id` | `case_timepoints.id` | 时间点主键。 |
| `timepoint_name` | 无持久化字段；由 `stage` / `captured_on` 生成展示名 | PPT 快照可保存医生选择时的展示名，但不得写回新字段。 |
| `captured_on` | `case_timepoints.captured_on` | 缺失时不显示，不阻止生成。 |
| `sequence_order` | `case_timepoints.sequence_order` | 多时间点排序唯一依据。 |
| 时间点完成状态 | `case_timepoints.completed_at` | 仅选择已完成时间点。 |
| 图片主键 | `case_images.id` | `image_id`。 |
| 图片时间点 | `case_images.timepoint_id` | 可为空；未归档图片不属于常规时间点选择。 |
| 图片存储路径 | `case_images.image_path` | 存储桶为 `case-images`。 |
| `image_url` | 运行时由 `image_path` 调用 Storage `getPublicUrl` 得到 | 不持久化 URL。 |
| `view_label` | `image_reviews.view_label`，以 `image_reviews.image_id = case_images.id` 关联 | 不在 `case_images` 表中。 |
| `category` | 由 `view_label` 经 `lib/photoViewTaxonomy.ts` 的 `PHOTO_VIEW_GROUPS` 推导 | 不是数据库列。 |
| `display_order` | 无持久化字段 | 由专用模板/兜底规则确定，并写入生成快照。 |
| 结构化总结 | `case_summaries.summary_json` + `case_summaries.summary_mode` | 现有 Contract Gate 的已确认内容来源。 |
| 总结新鲜度 | `case_summaries.input_fingerprint` | 可用于读取时判断复用，不是 PPT 新字段。 |

`case_timepoints` 的当前相关字段为：`id`、`case_id`、`sequence_order`、`captured_on`、`completed_at`、`is_final`、`stage`、`created_at`。其中 `stage` 的现有值可包括 `initial`、`ongoing`、`completed` 及历史兼容值；它不是独立的 `timepoint_name`。

### 2.1 现有图片 taxonomy

现有中文分类：面部、口内、其他。Contract 使用的分类代码只表示同一 taxonomy 的归组结果：

| Contract `category` | 现有中文组 | 现有 `view_label` |
| --- | --- | --- |
| `facial` | 面部 | `extraoral_frontal_relaxed`、`extraoral_frontal_smile`、`extraoral_right_profile`、`extraoral_left_profile` |
| `intraoral` | 口内 | `intraoral_frontal`、`intraoral_right_buccal`、`intraoral_left_buccal`、`intraoral_maxillary_occlusal`、`intraoral_mandibular_occlusal` |
| `other` | 其他 | `other` |

`unknown` / 缺失 `view_label` 不新增标签；仅进入 fallback。禁止建立 PPT 专用图片标签体系。

## 3. Request Contract

```text
PPTGenerationRequest
├── case_id
├── ppt_type
├── selected_timepoints[]
├── text_content
└── generation_constraints
```

`ppt_type` 仅允许：

```text
academic_discussion
case_showcase
```

请求代表一次生成快照：选择、解析后的图片 URL/路径、排序、文字和约束均在提交时固定；后续病例修改不追溯修改已提交请求。

### 3.1 `selected_timepoints[]`

```text
selected_timepoints[]
├── timepoint_id
├── timepoint_name
├── captured_on
├── sequence_order
└── selected_images[]
```

- 只能选择已完成时间点（`completed_at` 非空）。
- 多时间点按 `sequence_order` 升序，禁止依赖数据库返回顺序。
- `timepoint_name` 为请求快照展示值；当前项目无同名持久化列。

### 3.2 `selected_images[]`

```text
selected_images[]
├── image_id
├── category
├── view_label
├── image_url / storage_path
└── display_order
```

- `category` 仅可为 `facial`、`intraoral`、`other`，并必须按第 2.1 节从现有 taxonomy 推导。
- `view_label` 必须复用 `image_reviews.view_label` 与既有 taxonomy。
- 请求可带 `storage_path`（现有 `image_path`）和生成时解析的 `image_url`；不新增持久化 URL。
- `display_order` 是本次渲染的确定性快照，不要求数据库列。

### 3.3 Eligibility Rule：图片进入选择器的资格

只有同时满足以下条件的图片才进入 PPT 图片选择器：

1. 属于当前 `case`；
2. `case_images.timepoint_id` 非空；
3. 所属 timepoint 可以进入 PPT 选择范围（已完成且符合本 Contract 的时间点规则）；
4. 图片仍复用现有 `image_reviews.view_label` 与 taxonomy 数据。

`case_images.timepoint_id = null` 的未归档图片：

- 不显示在 PPT 图片选择器中；
- 不阻塞 PPT Generator；
- 不为 Phase 4 新增临时归档逻辑；
- 医生必须先回到现有病例照片 Workflow 完成归档，再进入 PPT 选择。

## 4. 文字 Content Contract

### 4.1 学术交流

```text
text_content
├── current_status[]
├── treatment_progress[]
└── discussion_question
```

- `current_status`：0–3 条，病例当前处于什么状态。
- `treatment_progress`：0–3 条，当前已完成什么。
- `discussion_question`：可选，由医生填写。

### 4.2 病例展示

```text
text_content
├── treatment_progress[]
├── final_status[]
└── optional_summary[]
```

- 各数组均为 0–3 条；`optional_summary` 可选。
- 优先使用现有总结中的 `final_outcome`（中文“最终情况”）作为 `final_status` 来源，避免强疗效评价。

### 4.3 已有 Case Summary Contract 的复用

可信文字输入仅来自 Doctor Review 后的 `case_voice_notes.confirmed_segments`，以及其通过现有 Case Summary Contract Gate 生成的 `case_summaries.summary_json`。现有 `summary_json` 包含：

- `case_overview`；
- `treatment_timeline[]`（`timepoint_id`、`captured_on`、`stage`、`content`、`source_timepoint_ids`）；
- 按 `summary_mode` 变化的事实数组：`initial_status`、`treatment_actions`、`key_changes`、`current_status`、`follow_up_focus`、`final_outcome`、`completion_summary`、`post_treatment_follow_up`。

## 5. AI 职责边界

Case Summary 本身仍来自 Phase 3 AI Workflow。Phase 4 MVP 直接让医生从现有 `case_summaries.summary_json` 选择可信条目，不重复调用模型做强制文本处理。

AI Text Compression 是 Optional enhancement / 后续可选增强，仅在选中的 Summary 文本确实需要进一步缩短时使用：

- 每个 Section 最多 3 条；
- 每条尽量不超过约 30 个中文字符；
- 不新增病例事实、不推断缺失信息；
- 不输出临床治疗建议；
- 不决定图片选择、自由版式或图片坐标。

AI 输入必须来自已完成 Doctor Review / Case Summary Contract Gate 的可信内容。压缩失败、不使用压缩或没有可压缩文字时，均不阻断图片 PPT 主链路；可直接使用已选 Summary 条目。

## 6. Rule-based Layout Engine

Layout Engine 是确定性的，AI 不参与自由布局。Phase 4 MVP 接受口内
标准三图或标准五图；每个时间点独立匹配，未命中即阻止生成，不使用
fallback 补图。前牙美学修复病例的 `case_showcase` 另有受限前后对比
特例，见 6.1。

MVP 执行顺序：

```text
1. 时间点优先
2. 时间点内部仅接受口内图片
3. 优先匹配 intraoral_standard_5
4. 否则匹配 intraoral_standard_3
5. 未命中或超过单页容量则阻止生成并提示医生调整选择
```

上述是执行层级，而不是平级规则竞争。

### 6.1 专用模板

| 条件 | `layout_type` | 固定语义顺序 |
| --- | --- | --- |
| 口内同时有上颌牙弓、右侧侧位、正面咬合、左侧侧位、下颌牙弓 | `intraoral_standard_5` | 上颌牙弓；右侧侧位 | 正面咬合 | 左侧侧位；下颌牙弓 |
| 口内有右侧侧位、正面咬合、左侧侧位 | `intraoral_standard_3` | 右侧侧位 | 正面咬合 | 左侧侧位 |
| 前牙美学修复 + 病例展示，恰好 2 个时间点且每点 1 张 `intraoral_frontal` | `anterior_aesthetics_comparison` | 较早 `sequence_order` 为治疗前；较晚为治疗后 |

标准五图优先于标准三图；顺序由 `view_label` 决定，不依赖数据库返回顺序。

### 6.2 Out of Scope / Future Extension：非口内与 fallback 布局

以下为保留的历史设计背景，不属于当前 Phase 4 MVP 的待开发能力：

- `facial_standard_3`、`facial_standard_4`；
- `other` 图片；
- `single_image`、`grid_2`、`grid_3`、`grid_2x2`、`grid_3plus2`、
  `grid_3x2` 等通用数量 fallback；
- `mixed_primary_secondary` 与跨类别拼图。

这些能力不能作为 MVP 未命中口内模板时的替代方案。未来如需实现，必须
另行扩展 Contract 并完成真实病例验收。

```text
1 张 → single_image
2 张 → grid_2
3 张 → grid_3
4 张 → grid_2x2
5 张 → grid_3plus2
6 张 → grid_3x2
```

“其他”独立处理，默认不将不同类别混成普通宫格。确有必要时才使用 `mixed_primary_secondary`，默认优先级为 `口内 > 面部 > 其他`；该规则低于正常按类别分区。

### 6.3 MVP Layout Type 枚举

```text
intraoral_standard_5
intraoral_standard_3
anterior_aesthetics_comparison
```

`layout_type` 是语义布局类型，不是图片绝对坐标。真实坐标由后续 PPT Template Renderer 的固定模板处理。

## 7. 缺失字段与容量策略

| 情况 | 行为 |
| --- | --- |
| 没有任何照片 | 阻止生成。 |
| 没有病例总结 | 允许生成。 |
| `current_status` 缺失 | 隐藏对应区域。 |
| `treatment_progress` 缺失 | 隐藏对应区域。 |
| `final_status` 缺失 | 隐藏对应区域。 |
| `discussion_question` 为空 | 不显示。 |
| `view_label` 缺失或非口内 | 不进入 MVP 图片选择器。 |
| 未命中标准三图/五图 | 阻止生成，提示医生选择标准口内三图或完整标准口内五图。 |
| 日期缺失 | 不显示，不阻塞。 |
| AI 文本压缩失败 | 不阻塞图片 PPT 主链路。 |

MVP v1 容量：最多 3 个时间点、每时间点最多 6 张照片、总计最多 10 张。超出时阻止生成并提示医生减少图片。单页 PPT 通过限制输入数量换取图片可读性和布局稳定性；MVP 不做无限缩放或复杂动态版面求解。

## 8. 医生 Workflow

```text
病例详情页
→ 生成病例 PPT
→ 选择 PPT 类型
→ 选择时间点
→ 选择照片
→ 确认 / 填写文字
→ 生成 PPT
```

学术交流使用当前病例状态、已完成治疗阶段及可选当前问题；病例展示使用治疗过程与最终情况。

## 9. 架构职责

```text
Existing Case Summary
      ↓
Doctor Content Selection
      ↓
Rule-based Layout Engine
      ↓
PPT Template Renderer
      ↓
Single-page PPT
```

- Existing Case Summary：提供 Phase 3 Contract Gate 后的可信结构化事实。
- Doctor Selection：医生控制展示哪些文字和图片。
- AI Text Compression：可选，仅在选中文本需要进一步缩短时使用。
- Layout Engine：确定性布局判断。
- Renderer：固定模板坐标与 PPT 文件输出。

## 10. 当前模型限制（非实现项）

本 Contract 不要求迁移，但实现前必须正视以下现有模型事实：

1. `category`、`timepoint_name`、`display_order` 均不是当前持久化字段；它们分别由 taxonomy、展示规则和 Layout Engine 生成。
2. `view_label` 位于 `image_reviews`，不是 `case_images`；PPT 查询必须采用该关联。
3. `image_url` 非持久化字段，必须从 `image_path` 在生成时解析。
4. `case_images.timepoint_id = null` 的未归档图片不进入 PPT 图片选择器；医生必须通过现有病例照片 Workflow 完成归档。Phase 4 不提供临时归档逻辑。

## 11. Known Pending Verification

`intraoral_standard_5` 与前牙美学 `anterior_aesthetics_comparison` 已实现并
通过代码级/回归逻辑验证。真实病例 PowerPoint 人工打开验收尚未记录为 PASS；
该待验收项不阻塞 Phase 4 MVP 冻结。未来分别使用完整标准五图和前牙美学
治疗前后对比的真实病例完成一次人工打开验收后补充记录。
