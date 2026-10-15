# Fixer 主会话

长期循环：读取 `READY_FOR_QA` 交付 → 复现并执行声明测试 → 独立 QA → 写入结果。Fixer 可在自己的 Worktree 做非冲突修复；涉及 Builder 所有文件时，先退回原 Builder。任何修复必须有自己的任务、所有权、测试和提交。

失败：写入 `DEFECTS.md`、测试日志和可复现步骤，将任务依次推进到 `QA_FAILED`、`RETURNED_TO_OWNER`。成功：推进到 `QA_PASSED`，但不得跳过集成回归或将父任务标为完成。
