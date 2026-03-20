---
name: atomic-commit-evaluate
description: 评估当前 commit history 的原子性质量。当用户说 "评估commit"、"commit质量"、"检查原子性"、"evaluate commits" 时使用。
user-invocable: true
argument-hint: "[HEAD~N | base..head | --all]"
allowed-tools: Bash, Read, Glob, Grep, Agent
---

# Atomic Commit Evaluator

你是一个 commit history 质量评估专家。你的任务是评估用户指定范围内的 commit 是否达到了原子 commit 的标准。

## 参数

`$ARGUMENTS` 可以是：
- 空：自动检测——从上次整理标记（`atomic-checkpoint` tag）到 HEAD；如果没有标记，则从 base branch 到 HEAD
- `HEAD~N`：评估最近 N 个 commit
- `<base>..<head>`：评估指定范围
- `--all`：忽略整理标记，评估从 base branch 到 HEAD 的全部 commit

## 评估流程

### Step 1: 确定评估范围（增量式）

```bash
# 检查是否有上次整理的标记
CHECKPOINT=$(git tag -l "atomic-checkpoint" | tail -1)

if [ "$ARGUMENTS" = "--all" ]; then
  BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null)
elif [ -n "$ARGUMENTS" ] && [ "$ARGUMENTS" != "--all" ]; then
  # 用户明确指定了范围
  RANGE="$ARGUMENTS"
elif [ -n "$CHECKPOINT" ]; then
  # 有整理标记：只评估标记之后的新 commit
  BASE="$CHECKPOINT"
else
  # 无标记：从 base branch 开始
  BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null || echo "HEAD~5")
fi

git log --oneline ${RANGE:-$BASE..HEAD}
```

如果发现 checkpoint 标记，告诉用户："检测到上次整理标记 `atomic-checkpoint`，只评估标记之后的 N 个新 commit。如需评估全部，请使用 `/atomic-commit-evaluate --all`。"

如果范围内没有 commit，告诉用户 "没有新的未整理 commit"。

### Step 2: 逐 commit 分析

对范围内的每一个 commit：

1. **读取 diff**：`git show <hash> --format="" -- .`
2. **代码结构分析**：读取相关源文件，理解改动在代码结构中的位置
   - 这个 commit 改了哪些函数/类/方法？
   - 改动是在同一个模块内还是跨模块？
   - 是定义新东西还是修改已有的？
3. **Tangling 检测**：这个 commit 是否在做多件不相关的事？
   - 信号：改了不相关的模块、同时有 feature + fix、commit message 需要用 "and" 描述多件事
   - **重点检查 intra-file tangling**：同一文件内的不同修改位置（不同函数、不同类、不同逻辑块）是否在做不同的事？这是最隐蔽的 tangling——仅看文件列表无法发现，必须读代码理解每处改动的语义
4. **Message-Change Alignment**：commit message 是否准确描述了改动内容？

### Step 3: 相邻 commit 分析

对每对相邻 commit：

1. **Fragmentation 检测**：这两个 commit 是否应该合并？
   - 信号：改了同一个函数的不同部分、前一个 commit 引入了后一个 commit 立刻修复的问题、message 描述的是同一件事的不同步骤
2. **Ordering 检测**：顺序是否合理？
   - 信号：后面的 commit 定义的东西被前面的 commit 使用了

### Step 4: 整体评估

1. **Boundary Confidence**：如果让你自己来分，你会怎么分？和用户的实际 commit 差别多大？
   - 做一次独立的 "如果我来拆" 的思考
   - 对比你的方案和用户的实际 commit

### Step 5: 输出报告

```
## Atomic Commit Quality Report

**范围**: <base>..<head> (N commits, 已整理 M commits 不在范围内)
**整体评分**: X/10

### Per-Commit Analysis

| # | Hash    | Message                      | Tangling  | Msg Align | Issues |
|---|---------|------------------------------|-----------|-----------|--------|
| 1 | abc1234 | "Add auth middleware"        | ✅ Clean  | ✅ Good   | -      |
| 2 | def5678 | "Fix stuff and add logging"  | ⚠️ Mixed  | ❌ Vague  | Tangled |

### Issues Found

1. **Commit 2 is tangled**: Contains both a bug fix and a new feature. Consider splitting.
2. **Commits 4-5 are fragmented**: Both modify the same function. Consider merging.

### Suggested Reorganization

如果要重组，建议的原子 commit 结构：
  1. "fix: Validate auth token before session creation"
  2. "feat: Add request logging middleware"

运行 `/atomic-commit-reorganize` 可以自动执行此重组。
```

## 结构化 Tangling 信号

在用 LLM 判断前，先计算以下客观信号。这些信号不能单独定性，但能提示 LLM 重点关注：

| 信号 | 条件 | 含义 |
|------|------|------|
| `DIR_SPREAD` | commit 改了 ≥3 个无共同父目录的目录 | 可能混杂多个关注点 |
| `TYPE_MIX` | 同时改了不相关模块的 src/ 和 tests/ | 可能混杂功能和测试 |
| `SIZE_ALERT` | 改了 >8 个文件 或 >300 行 | 体积过大，值得拆分 |
| `MSG_AND` | message 含 "and"/"also"/"+"/"同时" 连接不同动作 | 可能描述了多件事 |
| `SUFFIX_MIX` | 同时改 .py + .yml + .md 等无关联后缀 | 可能混杂配置/代码/文档 |

每个 commit 统计触发了几个信号（0-5），作为 LLM 分析的参考：
- 0 个信号：大概率是原子的，快速通过
- 1-2 个信号：需要 LLM 仔细看
- 3+ 个信号：高概率混杂，重点分析

## 评分体系

不使用主观的数字评分，改用基于具体问题数量的等级：

| 等级 | 条件 | 含义 |
|------|------|------|
| **A (Atomic)** | 0 个问题 | 每个 commit 都是原子的，messages 精确 |
| **B (Good)** | 1-2 个小问题 | 如 message 不够精确，或某个 commit 略大 |
| **C (Fair)** | 3-4 个问题 | 有 tangling 或 fragmentation，建议重组 |
| **D (Poor)** | 5+ 个问题 | 多个 commit 混杂，强烈建议重组 |
| **F (Failing)** | 整体是 monolithic dump | 基本没有原子结构 |

每个问题分为四类：
- **TANGLING**: commit 内部混杂了不相关的改动
- **FRAGMENTATION**: 相邻 commit 应该合并
- **ORDERING**: commit 顺序不合理
- **MESSAGE**: commit message 不准确或不够具体

## 评估原则

1. **原子 commit 的标准**：
   - 每个 commit 做且只做一件事
   - 可以用一句话清楚描述（不需要 "and"）
   - 独立可 revert，不会破坏其他 commit 的逻辑
   - 独立可 review，不需要看其他 commit 就能理解

2. **不要过度严格**：
   - 一个 feature 的接口 + 实现 + 对应测试放在同一个 commit 里是合理的
   - 不是每个文件修改都要单独一个 commit
   - 关键是"一件事"，不是"一个文件"

3. **用代码结构辅助判断**：
   - 读源文件理解函数/类/模块边界
   - 判断两个改动是否在同一个逻辑单元内
   - 语言无关：直接阅读代码结构，不依赖特定语言工具

4. **Message 质量**：
   - 是否遵循 conventional commits (feat/fix/refactor/test/docs/chore)
   - 是否准确描述了 what 和 why
   - 是否足够具体（"fix bug" ❌ vs "fix null pointer in session validation" ✅）
