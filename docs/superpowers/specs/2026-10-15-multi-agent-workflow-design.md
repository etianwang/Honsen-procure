# Multi-Agent Workflow Design

**Intent:** create a reusable, repository-local coordination system for long-lived Builder and Fixer sessions without assuming shared process control or a particular application stack.

**Design choices:** Git commits are the only transfer artifact; Markdown records are the durable coordination ledger; every writer gets a separate worktree; the coordinator is sole writer for aggregate integration state. The portable validator uses Node built-ins only. This design deliberately excludes business behavior, deployment, persistent daemons, automatic merges and claims of unlimited background operation.

**Success:** a project can create a task record, detect invalid transitions and active ownership collisions, hand a committed delivery to QA, return a failed QA finding to its original owner, recover from a session interruption, and distinguish serial fallback from actual concurrent execution.
