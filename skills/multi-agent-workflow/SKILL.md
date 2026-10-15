---
name: multi-agent-workflow
description: Run a repository-agnostic Builder/Fixer/QA workflow with isolated Git worktrees, Markdown handoffs, recoverable checkpoints, and honest serial fallback when parallel agents are unavailable.
---

# Multi-Agent Workflow

Use this skill when coordinating independent development and QA work across long-lived Codex sessions. First inspect Git status, all worktrees, active agent capabilities and `.agents/workflows/multi-agent-workflow/project.example.yaml`. Read the workflow files before selecting a role.

Choose `Builder` for a scoped implementation task, `Fixer` for independent verification or an isolated repair, and `Orchestrator` for dependency/ownership/integration decisions. Never claim concurrent execution unless the current runtime exposes usable sub-agent controls and available slots. Otherwise record `execution_mode: serial-fallback` and follow the same state machine serially.

Create a dedicated branch and worktree for every writing task. Treat committed SHA plus Markdown records as the cross-session protocol; no session may assume it can message or control another session. Validate with:

```powershell
node .agents/workflows/multi-agent-workflow/scripts/validate-workflow.mjs --ownership
```

## Windows PowerShell global installation

The repository copy is not automatically global. Copy this directory to the Codex skills directory, then restart/open a new Codex session so skill discovery reloads:

```powershell
$source = Join-Path (Get-Location) 'skills\multi-agent-workflow'
$destination = Join-Path $env:USERPROFILE '.codex\skills\multi-agent-workflow'
New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
Copy-Item -Recurse -Force $source $destination
```

Invoke it as `$multi-agent-workflow`. Installation only makes the skill discoverable; the repository-level `.agents/workflows/multi-agent-workflow/` remains the project policy and templates.
