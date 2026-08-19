# PPT Generator Selection Workflow v1

## Phase 4 状态

**Phase 4 — PPT Generator**
**Selection Workflow v1 — Frozen**

本文档定义医生从病例详情页进入 PPT Generator 后，完成 PPT 类型、病例总结条目、时间点、照片、可选问题和生成的选择流程。它定义用户操作流程，不定义 PPT 具体坐标，也不实现 UI。

后续实现必须遵循本 Workflow。只有真实开发或病例验收发现 Workflow 无法支持时才可修改；不得因 UI 美观或实现方便任意改变流程。

## 1. 入口与页面形态

入口：

```text
病例详情页
→ 生成病例 PPT
```

治疗中和已结束病例使用同一个入口、同一个 PPT Generator 页面。

默认推荐类型：

- 治疗中 → `academic_discussion`（学术交流）；
- 已结束 → `case_showcase`（病例展示）。

医生可以手动切换类型；病例状态不构成强制权限限制。

MVP 是单页面分段式流程，不拆分独立路由页面，不实现复杂 Stepper、Wizard 状态恢复或多页表单。

固定顺序：

```text
生成病例 PPT
1. 选择 PPT 类型
2. 选择病例总结条目
3. 选择时间点 / 照片
4. 学术交流可填写当前问题（可选）
5. 生成 PPT
```

## 2. Step 1：选择 PPT 类型

显示两个选项：

```text
学术交流   → academic_discussion
病例展示   → case_showcase
```

切换类型时：

- 已选择的时间点和照片原则上保留；
- 文字区域按类型切换；
- 不自动重新选择照片；
- 不自动生成医生问题。

## 3. Step 2：选择病例总结条目

医生直接从现有 `case_summaries.summary_json` 中选择结构化事实条目，不重新创建第二套病例总结，也不把 AI 文本压缩作为 MVP 生成必经步骤。

### 3.1 学术交流

主要可选来源：

- `current_status`；
- `treatment_actions` / 已完成治疗相关事实；
- Contract v1 中其他适合表达当前阶段的可信事实。

页面语义归入“当前病例状态”和“已完成治疗阶段 / 处理”。`discussion_question` 仍为可选字段，仅由医生填写，AI 不自动生成。

### 3.2 病例展示

主要可选来源：

- `treatment_actions`；
- `completion_summary`；
- `final_outcome`；
- Contract v1 中其他适合展示的可信字段。

页面语义归入“治疗过程”“最终情况”和可选“其他总结”。

### 3.3 文字数量

- 每个 Section 最多选择 3 条；
- PPT 总文字建议最多 6 条；
- 不要求必须选择文字；
- 有效照片即可生成；
- 已适合 PPT 的 Summary 条目直接使用，不强制压缩。

## 4. Step 3：选择时间点与照片

### 3.1 时间点资格与展示

只展示符合 `PPT_GENERATOR_CONTRACT_v1.md` Eligibility Rule 的时间点和图片：

- 属于当前 case；
- `case_timepoints.completed_at` 非空；
- 按 `sequence_order` 升序展示；
- 图片具有现有 `image_reviews.view_label` / taxonomy 数据。

`case_images.timepoint_id = null` 的未归档图片：

- 不进入 PPT 图片选择器；
- 不阻塞 PPT Generator；
- Phase 4 不提供临时归档；
- 医生必须先回到现有病例照片 Workflow 完成归档。

每个时间点至少展示：时间点名称/阶段、日期、照片选择区域。`timepoint_name` 继续作为展示快照值，不新增数据库字段。

### 3.2 时间点交互

医生先选择时间点，再在已选时间点内选择照片。

- 选择时间点后展开其可选照片；
- 未选时间点的照片不计入本次 PPT；
- 取消时间点时，该时间点下已选照片全部取消纳入；
- Checkbox、Card selection 等控件样式不在本 Workflow 冻结，由后续 Figma 决定。

最多选择 3 个时间点。达到上限后，其他时间点仍可见但不可继续选中；页面提示已达到上限，医生可取消已有时间点后重新选择。不得允许第 4 个先进入选择状态再到提交时报错。

### 3.3 照片分组与选择

Phase 4 MVP 只展示现有 taxonomy 中的“口内”照片；不得创建 PPT 专用
分类。面部、其他、mixed layout 和通用数量 fallback 均为 Out of Scope /
Future Extension。医生手动选择每张照片，且每张照片明确显示选中/未选中
状态。

MVP 不提供：AI 自动选图、自动替换、最佳照片推荐、自动裁图、拖拽修改 PPT 坐标。

实时显示：

```text
已选择 X / 10 张
```

限制：每个时间点最多 6 张，总计最多 10 张。

- 当前时间点达到 6 张时，其余照片不可继续选择，但其他时间点仍可选择（总数未达到 10 时）；
- 总数达到 10 张时，未选照片仍可见但不可选中，并提示需取消已有照片；
- 不得允许第 11 张进入选择状态后再报错。

### 3.4 图片顺序与布局职责

医生只负责选择照片，不负责排列坐标或手工排序。每个时间点必须独立命中
Contract v1 的口内标准五图或标准三图：

```text
按时间点分组和排序
→ 时间点内匹配 intraoral_standard_5
→ 否则匹配 intraoral_standard_3
→ 未命中则禁止生成
```

不提供拖拽排序、自由网格编辑或坐标编辑。顺序调整必须另行升级 Contract / Workflow，不在 MVP v1 增加。

前牙美学修复病例的 `case_showcase` 可使用受限前后对比：恰好选择 2 个
时间点，每个时间点恰好选择 1 张 `intraoral_frontal`。系统按
`sequence_order` 自动将较早时间点标记为“治疗前”、较晚标记为“治疗后”；
医生不手动标记或排序。

## 5. Step 4：学术交流当前问题

仅当 `ppt_type = academic_discussion` 时提供：

```text
当前病例状态
已完成治疗阶段 / 处理
当前问题（可选）
```

当前问题可选、仅医生填写，AI 不自动判断医生困惑或生成临床建议。为空时 PPT 不显示该区域。

## 6. Step 5：生成 PPT

本 MVP 不要求独立 Preview 步骤。选择页面本身应显示已选 Summary 条目、已选照片和数量；医生完成选择后可直接生成，生成结果作为最终视觉检查。不得实现 PPT Editor。

仅当以下条件全部满足时允许生成：

```text
至少选择 1 个时间点
至少选择 1 张有效照片
总照片数 <= 10
单时间点照片数 <= 6
时间点数 <= 3
每个时间点命中标准口内三图或完整标准口内五图
```

前牙美学修复病例的 `case_showcase` 前后对比可替代最后一项，但仅当恰好
2 个时间点且每点 1 张 `intraoral_frontal` 时有效。

没有病例总结或没有文字不阻止生成；病例总结文字不是生成条件。

生成状态需要支持：

```text
idle
generating
success
error
```

- `generating`：禁止重复点击，明确显示“正在生成病例 PPT”；
- `success`：提供最终 PPT 文件结果；
- `error`：明确告知失败，并尽量保留已选时间点、照片和医生文字，不要求从头选择。

不设计任务队列、历史记录或后台任务系统。

## 8. MVP Out of Scope

以下不属于 Selection Workflow v1：

```text
AI 自动选图
AI 自动生成医生疑问
AI 临床治疗建议
多页 PPT
PPT 模板选择器
PPT 自由编辑器
图片拖拽排版
字体 / 颜色 / 动画配置
图片裁剪器
未归档图片临时归档
历史 PPT 管理中心
多人协作
面部照片布局
其他照片布局
mixed layout
generic fallback grid
```

## 9. 职责边界

```text
Doctor Selection
      ↓
Content Contract
      ↓
Rule-based Layout Engine
      ↓
PPT Template Renderer
      ↓
Single-page PPT
```

医生控制展示内容；MVP 不重复调用 AI 压缩文字；Layout Engine 决定确定性
口内布局；Renderer 负责固定模板与文件输出。AI Text Compression 仅为后续
可选增强。

## 10. Workflow 验收标准

1. 医生从病例详情页明确进入生成流程；
2. 同一页面完成类型、Summary 条目、时间点、照片和可选问题选择；
3. 可切换 `academic_discussion` / `case_showcase`；
4. 仅展示符合 Eligibility Rule 的时间点和照片；
5. 未归档图片不会进入选择器；
6. 最多 3 个时间点、单时间点最多 6 张、总计最多 10 张；
7. 实时显示选择数量并在达到上限前阻止继续选择；
8. 每个 Section 最多 3 条、总文字建议最多 6 条；
9. 当前问题只能由医生填写；
10. 文字缺失不阻塞生成；
11. 不要求独立 Preview，且不提供 PPT Editor；
12. 医生不需要决定图片坐标；
13. 不引入 Phase 1–3 外的新核心功能。

## 11. Known Pending Verification

`intraoral_standard_5` 与前牙美学 `anterior_aesthetics_comparison` 已实现并
通过代码级/回归逻辑验证。真实病例 PowerPoint 人工打开验收尚未记录为 PASS；
该待验收项不阻塞 Phase 4 MVP 冻结。
