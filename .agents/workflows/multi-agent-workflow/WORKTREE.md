# Worktree 与 Git

每个任务使用独立分支 `codex/<role>-<task>` 和独立 Worktree，从协调者指定的基线创建。先 `git status --short`，再 `git fetch origin main`；不得在其他会话已有 Worktree 中写入。共享输入只接受已提交 SHA。

禁止 `git reset --hard`、`git clean -fd`、强推、未经授权合并或删除数据。完成时提交任务代码、测试和台账；不推送、不建 PR、不合并，除非人类明确授权。集成者先验证目标基线与提交范围，冲突回退给相应 Owner，不在集成时隐式改业务行为。
