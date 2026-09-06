---
name: pcb-repair
description: >-
  Applies this project's PCB visual fault diagnosis, safety-first 8-step repair
  workflow, RAG knowledge usage, and RepairView JSON schema. Use when changing
  维修识别, src/services/ai.js, knowledge-base RAG, repair prompts, or generating
  circuit-board fault analysis for AI电路板辅助维修系统.
---

# PCB 电路板智能故障识别与标准化维修

本仓库维修识别必须遵循该 Skill。运行时提示词以 `src/skills/pcb-repair.md` 为准；细节与故障模型见 [reference.md](reference.md)。

## 何时使用

- 修改 `src/services/ai.js`、`RepairView.vue`、知识库 RAG、识别结果字段
- 为电路板实拍图生成故障分析、排查步骤、风险预警
- 把知识库摘录注入识别，且必须与实拍图交叉验证

## 强制优先级（不可颠倒、不可省略）

外观视觉检测 → 静态断电检测（防二次烧件） → 故障区域锁定 → 动态上电检测 → 信号波形检测 → 元件修复更换 → 功能验证老化

**故障判定**：外观显性故障优先判定 + 故障现象匹配高频故障点 + 分区电路逻辑校验 + 仪器检测佐证

**强制约束**：未完成静态阻值检测、未排除短路风险，禁止输出上电检测、通电调试相关指令。

## 本项目输入

识别接口实际输入：

1. 电路板正面实拍图（必填）
2. 电路板反面实拍图（选填）
3. 原理图（选填）
4. 本地 RAG 知识库摘录（选填，由 `retrieveChunks` 注入）

无故障现象文字时，从图像推断现象；不要向用户索要本系统没有的输入框。

## 本项目输出

大模型必须只返回 JSON（不要 Markdown），字段与 `RepairView` 对齐。改提示词或结果展示时同步改两边。

完整字段见 `src/skills/pcb-repair.md`。

`repairSteps` 必须覆盖固定 8 步：安全预处理 → 目视复检 → 静态阻值检测 → 故障分区定位 → 动态电压检测 → 波形信号检测 → 元件修复更换 → 验证老化测试。短路类强化静态检测；功能异常强化信号检测；间歇性故障强化虚焊与电容。

## 安全拦截（维修风险）

- 禁止未放电、未断电检测维修
- 禁止未排查短路故障反复上电
- 禁止随意加大保险、功率器件参数
- 禁止烧保险故障强行通电测试

## RAG

有知识库摘录时优先参考型号、故障特征、维修方法；与实拍图冲突时以实拍图为准，并在 `knowledgeRefs` 说明。不要把未检索到的手册内容当成事实。

## 元件标注图

元件标注的完成度、箭头位置、文字不重叠规则见 `.cursor/skills/pcb-annotation/SKILL.md`。

## 改代码时

1. 系统提示只从 `src/skills/pcb-repair.md` 加载，不要在 `ai.js` 另写一套互相冲突的规则
2. 不要降低安全优先级或把上电步骤提前到静态检测之前
3. 新增结果字段时同时改 Skill JSON、解析展示、复制全文
