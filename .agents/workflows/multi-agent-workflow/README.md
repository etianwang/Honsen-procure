# 多 Agent 协作工作流

这是项目级、与技术栈无关的协作协议。它用 Git Worktree 隔离代码，用 Markdown 作为跨会话事实记录，用 Git 提交作为唯一可集成交付物；它不创建后台服务，也不假定不同 Codex 主会话能够互相发消息。

## 快速开始

1. 复制 `project.example.yaml` 为项目约定的配置（或保持示例作为规范）。
2. 协调者在 `docs/agent-coordination/tasks/` 以 `TASK-TEMPLATE.md` 建立任务，并先运行校验。
3. Builder/Fixer 各自在独立 Worktree 和分支工作，只写自己任务的 `owned_files`。
4. Builder 提交交付后将任务置为 `READY_FOR_QA`，填写 `DELIVERIES.md`；Fixer 接收后置为 `QA_RUNNING`。
5. QA 成功进入集成回归；失败创建缺陷记录，状态必须经 `QA_FAILED → RETURNED_TO_OWNER → FIXING` 回到原 Owner。

运行：`node .agents/workflows/multi-agent-workflow/scripts/validate-workflow.mjs --ownership`。

## Builder / Fixer 启动命令

以下命令只建立隔离环境；实际主会话以 `$multi-agent-workflow` 读取任务记录后选择相应角色，不假设存在未声明的 Codex CLI 参数。

```powershell
# Builder：替换 TASK-123 和 <base-ref>，然后在新 Codex 主会话输入：$multi-agent-workflow Builder TASK-123
git fetch origin main
git worktree add ..\builder-TASK-123 -b codex/builder-TASK-123 <base-ref>
Set-Location ..\builder-TASK-123
node .agents/workflows/multi-agent-workflow/scripts/validate-workflow.mjs --ownership

# Fixer：只使用独立修复任务；然后在新 Codex 主会话输入：$multi-agent-workflow Fixer BUG-456
git fetch origin main
git worktree add ..\fixer-BUG-456 -b codex/fixer-BUG-456 <base-ref>
Set-Location ..\fixer-BUG-456
node .agents/workflows/multi-agent-workflow/scripts/validate-workflow.mjs --ownership
```

`<base-ref>` 必须由协调记录指定为已提交的 SHA 或受保护分支引用。若运行环境不支持并发子代理，Builder 与 Fixer 仍可按同一记录串行轮换，并在检查点注明 `serial-fallback`。

项目级工作流由仓库内 `.agents/workflows/...` 发现；全局 `$multi-agent-workflow` 则需要按 `skills/multi-agent-workflow/SKILL.md` 安装，不会因本目录存在而自动安装。
