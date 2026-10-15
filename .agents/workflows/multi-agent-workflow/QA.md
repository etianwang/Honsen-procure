# QA 与质量门禁

QA 使用交付提交在独立 Worktree 复跑任务声明的命令，并保存命令、环境摘要、完整日志位置和结果。协调者可运行 `node .agents/workflows/multi-agent-workflow/scripts/run-qa.mjs <task-record>`：它只接收 `READY_FOR_QA`、有有效 SHA 和完整状态历史的记录，顺序运行记录中的 `test_commands`，并持久化 `QA_RUNNING → QA_PASSED` 或 `QA_RUNNING → QA_FAILED → RETURNED_TO_OWNER` 与日志。命令由可信协调者维护；脚本不会发现、分配或伪造 Agent。

测试失败必须附最小复现、期望/实际、严重度、受影响提交和退回 Owner。通过 QA 后仍必须在集成分支/Worktree 执行回归；冲突、回归失败或缺少证据都阻止 `ACCEPTED`。
