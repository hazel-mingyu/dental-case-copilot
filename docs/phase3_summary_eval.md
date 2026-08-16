# Phase 3 — AI Workflow Evaluation

## 1. Phase 3 状态

状态：Completed / Frozen

范围：

- Voice Case Note
- Case Summary Runtime
- Contract Gate
- Semantic Golden Case
- Summary Freshness
- Treatment Date Editing
- Summary Reuse

## 2. Case Summary Runtime 验收

模型：`qwen3.7-plus-2026-05-26`

配置：

- 默认 thinking
- 未设置 `enable_thinking=false`
- 未设置 `thinking_budget`

Golden Case：`2b08d1da-2dea-4b9b-bc90-772dceb212d6`

结果：

- Automatic Contract：PASS
- Semantic Quality：PASS
- Hallucination Check：PASS

总结 section：

- 病例概述：PASS
- 治疗时间线：PASS
- 初诊情况：PASS
- 治疗处理：PASS
- 关键变化：PASS
- 最终情况：PASS
- 治疗总结：PASS
- 治疗后随访：PASS

## 3. Freshness Evaluation

Fingerprint 包含：

- `case_id`
- `summary_mode`
- `timepoint_id`
- `sequence_order`
- `confirmed_text`

Fingerprint 排除：

- `captured_on`
- `created_at`
- `completed_at`
- UI fields
- raw ASR
- draft
- Vision prediction

| 场景 | 结果 |
|---|---|
| fingerprint 相同 | reuse |
| 仅 `captured_on` 修改 | reuse |
| `confirmed_text` 修改 | regenerate |
| `summary_mode` 修改 | regenerate |
| fingerprint `NULL` | regenerate |
| Contract FAIL | 不覆盖旧 Summary |

新增字段：`case_summaries.input_fingerprint`

## 4. Latency Evaluation

- Reuse：约 `723 ms`
- Regenerate：约 `70–100 s`
- 异常：一次约 `401 s`

判断：主要瓶颈来自 Qwen provider latency。

系统侧：

- Runtime Input：<1s
- Freshness：<1s
- Database operation：<1s

Decision：MVP 接受约 1 分钟生成时间。

优化策略：

- Loading feedback
- Freshness reuse

## 5. Product Decision

选择质量优先。

原因：

- Flash 模型 latency 更低，但 Semantic Quality FAIL。
- 旧 Plus 模型 Contract FAIL 且 latency 更高。
- 当前 Plus 满足病例总结质量要求。
