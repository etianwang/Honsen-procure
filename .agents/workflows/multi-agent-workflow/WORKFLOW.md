# 执行协议

状态机唯一有效路径：`TODO → ASSIGNED → IN_PROGRESS → READY_FOR_QA → QA_RUNNING`。成功路径为 `QA_PASSED → READY_FOR_INTEGRATION → INTEGRATED → ACCEPTED`；失败路径为 `QA_FAILED → RETURNED_TO_OWNER → FIXING → READY_FOR_QA`。

每个状态变更写入任务记录、交付/缺陷/集成记录和会话检查点。QA 不得直接修复 Owner 的任务：问题必须退回原 Owner；Owner 不可用时协调者才可显式重新指派并记录原因。`ACCEPTED` 只能在集成回归成功后设置，父任务的验收由父任务 Owner 另行决定。

任务记录必须包含 Task ID、Owner、Worktree/分支、提交 SHA、文件所有权、依赖、命令和日志、QA 结果、修复轮次及验收证据。提交 SHA 为 `PENDING` 前，不得进入 QA。
