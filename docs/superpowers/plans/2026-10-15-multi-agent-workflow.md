# Multi-Agent Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a portable, tested Builder/Fixer workflow in repository documentation and a zero-dependency validator.

**Architecture:** Repository-local workflow policy and coordination templates are Markdown/YAML. A Node built-in validator enforces required artifacts, task-record shape, legal state transitions and active file ownership uniqueness. A separate skill explains discovery and installation without claiming it is globally installed.

**Tech Stack:** Markdown, YAML-shaped frontmatter, Node.js built-ins, `node:test`, Git Worktree.

**Spec:** `docs/superpowers/specs/2026-10-15-multi-agent-workflow-design.md`

## Global Constraints

- Do not bind the workflow to this repository's domain, framework or task numbering.
- Do not modify application code, deployment settings or other worktrees.
- Do not claim parallel agents when the runtime cannot provide them.
- Never auto-merge or overwrite another session's uncommitted work.

## Review Focus

- A task cannot skip QA states; Task 1 test validates illegal transition rejection.
- Two active tasks cannot own the same file; Task 1 test validates collision detection.
- Missing workflow assets fail validation; Task 1 test validates complete skeleton.
- Interrupted sessions have durable recovery fields; Task 2 documents checkpoint requirements.
- Global and repository skill discovery are not conflated; Task 2 documents both paths.

---

### Task 1: Validator and automated proof

**Files:**

- Create: `.agents/workflows/multi-agent-workflow/scripts/validate-workflow.mjs`
- Test: `tests/workflow/multi-agent-workflow.test.mjs`

**Interfaces:**

- Produces: `validateWorkflow(root)`, `validateTaskRecord(path, previousState)`, `validateOwnership(tasksDirectory)` returning error arrays.

- [x] Write tests for complete skeleton, illegal transition and overlapping active ownership.
- [x] Run `node --test tests/workflow/multi-agent-workflow.test.mjs`; RED confirmed because validator was absent.
- [x] Implement the exported validator functions using Node built-ins only.
- [x] Run the same command; PASS confirmed.

### Task 2: Reusable policy, templates and skill

**Files:**

- Create: `.agents/workflows/multi-agent-workflow/*.md`, `project.example.yaml`
- Create: `docs/agent-coordination/*.md`
- Create: `skills/multi-agent-workflow/SKILL.md`

**Interfaces:**

- Consumes: Task 1 validator file requirements.
- Produces: Builder/Fixer/QA/orchestration/recovery/runbook templates and global installation instructions.

- [x] Add docs defining ownership, state machine, QA return, integration gate, serial fallback and recovery.
- [x] Run validator with `--ownership`; PASS confirmed.
- [x] Run focused Node tests again; PASS confirmed.

### Task 3: Simulated delivery and verification

**Files:**

- Modify: `docs/agent-coordination/` templates only if simulation reveals a gap.
- Test: `tests/workflow/multi-agent-workflow.test.mjs`

**Interfaces:**

- Consumes: validator APIs and task state protocol.

- [x] Simulate normal delivery, QA failure/return and recovery through automated test records.
- [x] Run focused tests and repository quality checks appropriate to documentation/Node changes.
- [ ] Commit only workflow documentation, validator and tests on the dedicated branch.
