import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  validateOwnership,
  validateCheckpointRecord,
  validateTaskRecord,
  validateWorkflow,
} from '../../.agents/workflows/multi-agent-workflow/scripts/validate-workflow.mjs'

async function write(root, relativePath, content) {
  const target = join(root, relativePath)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, content, 'utf8')
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'multi-agent-workflow-'))
  const required = [
    'README.md',
    'WORKFLOW.md',
    'BUILDER.md',
    'FIXER.md',
    'ORCHESTRATOR.md',
    'QA.md',
    'WORKTREE.md',
    'RECOVERY.md',
  ]
  for (const name of required) {
    await write(
      root,
      `.agents/workflows/multi-agent-workflow/${name}`,
      '# Workflow\n',
    )
  }
  await write(
    root,
    'skills/multi-agent-workflow/SKILL.md',
    '---\nname: multi-agent-workflow\ndescription: test\n---\n',
  )
  await write(
    root,
    '.agents/workflows/multi-agent-workflow/project.example.yaml',
    'workflow_version: 1\ncoordination_dir: docs/agent-coordination\ntask_directory: tasks\n',
  )
  for (const name of [
    'TASKBOARD.md',
    'INTERFACE-CONTRACTS.md',
    'DELIVERIES.md',
    'DEFECTS.md',
    'INTEGRATION.md',
    'CHECKPOINTS.md',
  ]) {
    await write(root, `docs/agent-coordination/${name}`, '# Coordination\n')
  }
  return root
}

const task = (id, owner, file) => `---
task_id: ${id}
state: READY_FOR_QA
owner: ${owner}
worktree: C:/worktrees/${owner}
branch: codex/${owner}
commit: 0123456789abcdef0123456789abcdef01234567
dependencies: []
owned_files:
  - ${file}
test_commands:
  - node --test
test_log: logs/${id}.txt
qa_result: PENDING
repair_round: 0
acceptance_evidence: pending
---
# ${id}
`

test('accepts a complete workflow skeleton', async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.deepEqual(await validateWorkflow(root), [])
})

test('rejects an illegal task state transition', async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const record = join(root, 'task.md')
  await writeFile(record, task('WF-1', 'builder-a', 'docs/a.md'), 'utf8')
  const errors = await validateTaskRecord(record, 'TODO')
  assert.match(errors.join('\n'), /TODO -> READY_FOR_QA/)
})

test('detects overlapping file ownership for active tasks', async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  await write(
    root,
    'docs/agent-coordination/tasks/WF-1.md',
    task('WF-1', 'builder-a', 'shared.md'),
  )
  await write(
    root,
    'docs/agent-coordination/tasks/WF-2.md',
    task('WF-2', 'fixer-a', 'shared.md'),
  )
  const errors = await validateOwnership(
    join(root, 'docs/agent-coordination/tasks'),
  )
  assert.match(errors.join('\n'), /shared.md.*WF-1.*WF-2/)
})

test('accepts a mocked QA failure return-to-owner and repair loop', async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const record = join(root, 'task.md')
  for (const [previous, state] of [
    ['QA_RUNNING', 'QA_FAILED'],
    ['QA_FAILED', 'RETURNED_TO_OWNER'],
    ['RETURNED_TO_OWNER', 'FIXING'],
    ['FIXING', 'READY_FOR_QA'],
  ]) {
    await writeFile(
      record,
      task('WF-RECOVER', 'builder-a', 'docs/recover.md').replace(
        'state: READY_FOR_QA',
        `state: ${state}`,
      ),
      'utf8',
    )
    assert.deepEqual(await validateTaskRecord(record, previous), [])
  }
})

test('accepts a mocked normal delivery after integration', async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const record = join(root, 'task.md')
  await writeFile(
    record,
    task('WF-DELIVERY', 'builder-a', 'docs/delivery.md')
      .replace('state: READY_FOR_QA', 'state: ACCEPTED')
      .replace('qa_result: PENDING', 'qa_result: PASSED'),
    'utf8',
  )
  assert.deepEqual(await validateTaskRecord(record, 'INTEGRATED'), [])
})

test('allows parallel active tasks only when file ownership is isolated', async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  await write(
    root,
    'docs/agent-coordination/tasks/WF-A.md',
    task('WF-A', 'builder-a', 'docs/a.md'),
  )
  await write(
    root,
    'docs/agent-coordination/tasks/WF-B.md',
    task('WF-B', 'fixer-a', 'docs/b.md'),
  )
  assert.deepEqual(
    await validateOwnership(join(root, 'docs/agent-coordination/tasks')),
    [],
  )
})

test('requires durable fields in a recovery checkpoint', () => {
  const incomplete = '- Current goal: validate workflow\n'
  assert.match(validateCheckpointRecord(incomplete).join('\n'), /Open defects/)
  const complete = [
    '- Current goal: validate workflow',
    '- Completed task IDs and commits: WF-1 abc1234',
    '- Running task IDs / owners: none',
    '- Worktree, branch and dirty files: clean',
    '- Open defects: none',
    '- External blockers: none',
    '- Next safe action: handoff',
  ].join('\n')
  assert.deepEqual(validateCheckpointRecord(complete), [])
})
