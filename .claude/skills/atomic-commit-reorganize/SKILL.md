---
name: atomic-commit-reorganize
description: 将杂乱的 commit history 重组为干净的原子 commit。当用户说 "整理commit"、"reorganize commits"、"atomic commit"、"clean up history"、"重新组织提交" 时使用。
user-invocable: true
argument-hint: "[HEAD~N | base..head | --dry-run]"
allowed-tools: Bash, Read, Glob, Grep, Edit, Write, Agent
---

# Atomic Commit Reorganizer

你是一个 commit history 重组专家。你的任务是将用户指定范围内的杂乱 commit 重组为干净的原子 commit。

## 参数

`$ARGUMENTS` 可以是：
- 空：自动检测——从上次整理标记（`atomic-checkpoint` tag）到 HEAD；如果没有标记，则从 base branch 到 HEAD
- `HEAD~N`：重组最近 N 个 commit
- `<base>..<head>`：重组指定范围
- `--dry-run`：只展示方案，不执行

## 重组流程

### Step 1: 确定范围 + 安全备份

```bash
# 检查是否有上次整理的标记
CHECKPOINT=$(git tag -l "atomic-checkpoint" | tail -1)

if echo "$ARGUMENTS" | grep -q "\-\-dry-run"; then
  DRY_RUN=true
  ARGS=$(echo "$ARGUMENTS" | sed 's/--dry-run//' | xargs)
else
  DRY_RUN=false
  ARGS="$ARGUMENTS"
fi

# CRITICAL: 检查工作区是否干净
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️ 工作区有未提交的修改："
  git status --short
  echo ""
  echo "重组前必须保证工作区干净。请先："
  echo "  git stash        # 暂存未提交的修改"
  echo "  git add . && git commit  # 或者先提交"
  echo ""
  echo "重组完成后可以 git stash pop 恢复。"
  exit 1
fi

if [ -n "$ARGS" ]; then
  BASE_REF="$ARGS"
elif [ -n "$CHECKPOINT" ]; then
  BASE_REF="$CHECKPOINT"
  echo "检测到整理标记 atomic-checkpoint，只重组标记之后的 commit"
else
  BASE_REF=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null)
fi

# 展示范围
git log --oneline ${BASE_REF}..HEAD
```

如果范围内没有 commit，告诉用户 "没有新的未整理 commit" 并退出。

```bash
# 创建安全备份（CRITICAL - 必须在任何操作之前）
BACKUP="backup/pre-atomic-$(date +%Y%m%d-%H%M%S)"
git branch $BACKUP
echo "✓ 安全备份已创建: $BACKUP"
```

### Step 2: 评估当前 history

先运行评估（和 `/atomic-commit-evaluate` 相同的逻辑）：

1. 逐 commit 分析 tangling 和 message alignment
2. 分析相邻 commit 的 fragmentation
3. 形成对当前 history 的整体判断

如果当前 history 已经很好（评分 >= 8/10），告诉用户 "你的 commit history 已经很干净了，不需要重组"，并询问是否仍要继续。

### Step 3: 生成 squashed diff 并分析

```bash
git diff $BASE_REF..HEAD > /tmp/_atomic_squash.diff
git diff $BASE_REF..HEAD --stat
git diff $BASE_REF..HEAD --name-only
```

仔细阅读整个 squashed diff，理解所有的改动。读取相关源文件，利用代码结构（函数/类/模块边界）辅助理解每个 hunk 的语义角色。

### Step 4: 设计原子 commit 方案

每个原子 commit 必须：
- **单一关注点**：做且只做一件事
- **自包含**：不看其他 commit 就能理解
- **可回放**：按顺序 apply 不会出错
- **可 revert**：单独 revert 不会破坏其他 commit

**分组策略**（优先级从高到低）：
1. 同一个 bug fix 的所有改动（包括对应测试）→ 一个 commit
2. 同一个 feature 的接口 + 实现 + 配置 → 一个 commit
3. 纯 refactor（不改行为）→ 独立 commit
4. 纯 test 补充（不伴随功能改动）→ 独立 commit
5. 配置/依赖/CI 改动 → 独立 commit
6. 文档改动 → 独立 commit

**排序策略**：
1. 基础设施/配置改动最先
2. refactor 在 feature 之前（先清理再构建）
3. 实现在测试之前
4. 如果 commit B 用了 commit A 引入的东西，A 必须在 B 前面

### Step 5: 展示方案并等待确认

**必须在执行前展示方案并等用户确认。**

```
## 重组方案

当前: 7 个杂乱 commit → 重组为 4 个原子 commit

### Commit 1: chore: Update database migration config
  Files: config/database.yml, alembic.ini
  来源: 原 commit 2 (部分) + 原 commit 5 (部分)

### Commit 2: refactor: Extract validation logic into dedicated module
  Files: src/validation.py (new), src/api.py (modify)
  来源: 原 commit 1 + 原 commit 3

### Commit 3: feat: Add rate limiting to API endpoints
  Files: src/middleware.py (new), src/api.py (modify), src/config.py
  来源: 原 commit 4 + 原 commit 6

### Commit 4: test: Add tests for validation and rate limiting
  Files: tests/test_validation.py (new), tests/test_middleware.py (new)
  来源: 原 commit 2 (部分) + 原 commit 7

是否执行？[y/n/edit]
```

- 用户说 `y`：执行 Step 6
- 用户说 `n`：终止
- 用户说 `edit` 或提出修改意见：调整方案后重新展示
- 如果是 `--dry-run`：展示方案后直接结束，不执行

### Step 6: 执行重组

**必须确保零数据丢失。使用 worktree 隔离执行。**

```bash
# 记录当前 HEAD 的 tree hash（用于最终验证）
EXPECTED_TREE=$(git rev-parse HEAD^{tree})

# 在临时 worktree 中执行，不影响主分支
WORK_DIR=$(mktemp -d)
git worktree add "$WORK_DIR" $BASE_REF --detach
cd "$WORK_DIR"
```

然后对每个原子 commit，**按顺序**构建目标文件状态：

**核心原则：直接写文件内容，不用 patch**

对于每个原子 commit 中的每个文件：

1. **读取该文件在这个 commit 之后应有的内容**（agent 根据 diff 分析结果计算）
2. **直接用 Write/Edit 工具写入文件**
3. `git add <file>`

这样做的好处：
- 完全避免 `git apply` 的 context mismatch 问题
- 对 intra-file split 天然支持（同一文件的不同部分在不同 commit 中逐步写入）
- Agent 对文件内容有完全控制

**intra-file split 的处理方式**：

同一文件的不同修改属于不同 commit 时（这在 35% 的真实 episode 中出现）：
1. Commit 1：从 base 状态的文件出发，只应用属于 commit 1 的改动，写入文件
2. Commit 2：在 commit 1 之后的文件状态上，追加属于 commit 2 的改动，写入文件
3. 依此类推

Agent 需要仔细跟踪每个文件在每一步的状态。

```bash
# 每个 commit 完成后
git add <files for this commit>
git commit -m "commit message"
```

**异常处理**：如果任何步骤出错，立即放弃 worktree 并通知用户：
```bash
cd -
git worktree remove "$WORK_DIR" --force
echo "✗ 执行失败，原始分支未受影响"
```

### Step 7: 验证 + 替换

```bash
# 在 worktree 中验证: final tree 必须和原始一致
ACTUAL_TREE=$(git rev-parse HEAD^{tree})
if [ "$EXPECTED_TREE" != "$ACTUAL_TREE" ]; then
  echo "✗ 验证失败！tree hash 不一致，放弃重组"
  cd -
  git worktree remove "$WORK_DIR" --force
  echo "原始分支未受影响"
  exit 1
fi

echo "✓ Tree hash 验证通过"

# 记录 worktree 中新的 HEAD
NEW_HEAD=$(git rev-parse HEAD)
cd -

# 将原始分支指向新的 commit history
git reset --hard $NEW_HEAD

# 清理 worktree
git worktree remove "$WORK_DIR" --force

# 更新整理标记
git tag -f atomic-checkpoint HEAD
echo "✓ 整理标记已更新: atomic-checkpoint → $(git rev-parse --short HEAD)"

# 展示最终结果
git log --oneline --stat ${BASE_REF}..HEAD
```

### Step 8: 清理

```bash
echo ""
echo "重组完成！"
echo "  备份分支: $BACKUP (可用 git branch -D $BACKUP 删除)"
echo "  整理标记: atomic-checkpoint (下次整理将从此处开始)"
echo "  如需恢复: git reset --hard $BACKUP"
echo ""
echo "注意: 重组改变了 commit history。"
echo "  如果已经 push 过，需要 force push: git push --force-with-lease"
```

## 安全规则（不可违反）

1. **永远先创建备份分支**
2. **永远在执行前展示方案并等用户确认**
3. **永远在执行后验证 tree hash 一致**
4. **验证失败立即恢复到备份**
5. **不主动 force push**——只提醒用户需要 force push
6. **如果 intra-file split 太复杂，宁可保守合并也不要丢代码**
7. **重组成功后更新 `atomic-checkpoint` tag**

## 增量整理机制

- 每次重组成功后，自动在 HEAD 打 `atomic-checkpoint` tag
- 下次调用时，默认只重组 `atomic-checkpoint..HEAD` 的新 commit
- 已整理过的 commit 不会被再次触碰
- 用户可用 `--all` 或指定范围来覆盖此行为

## 和 evaluate 的关系

`reorganize` 的前半部分就是 `evaluate`。区别在于：
- `evaluate` 只输出报告
- `reorganize` 在报告基础上生成方案并执行
- `reorganize` 成功后会更新 `atomic-checkpoint` tag

如果用户只想看看质量如何，用 `/atomic-commit-evaluate`。
如果用户想直接整理，用 `/atomic-commit-reorganize`。
