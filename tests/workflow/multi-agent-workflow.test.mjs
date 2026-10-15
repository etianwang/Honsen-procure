import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

import {
  validateOwnership,
  validateCheckpointRecord,
  validateTaskRecord,
  validateWorkflow,
} from '../../.agents/workflows/multi-agent-workflow/scripts/validate-workflow.mjs'
import { runQa } from '../../.agents/workflows/multi-agent-workflow/scripts/run-qa.mjs'

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

const task = (
  id,
  owner,
  file,
  state = 'READY_FOR_QA',
  history = ['TODO', 'ASSIGNED', 'IN_PROGRESS', 'READY_FOR_QA'],
  commit = '0123456789abcdef0123456789abcdef01234567',
) => `---
task_id: ${id}
state: ${state}
owner: ${owner}
worktree: C:/worktrees/${owner}
branch: codex/${owner}
commit: ${commit}
dependencies: []
owned_files:
  - ${file}
test_commands:
  - node --test
test_log: logs/${id}.txt
qa_result: PENDING
repair_round: 0
acceptance_evidence: pending
state_history:
${history.map((entry) => `  - ${entry}`).join('\n')}
---
# ${id}
`

test('accepts a complete workflow skeleton', async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.deepEqual(await validateWorkflow(root), [])
})

test('rejects a forged state history even when caller predecessor is legal', async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const record = join(root, 'task.md')
  await writeFile(
    record,
    task('WF-1', 'builder-a', 'docs/a.md', 'ACCEPTED', ['TODO', 'ACCEPTED']),
    'utf8',
  )
  const errors = await validateTaskRecord(record, 'INTEGRATED')
  assert.match(
    errors.join('\n'),
    /Illegal state history transition: TODO -> ACCEPTED/,
  )
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
    const history =
      previous === 'QA_RUNNING'
        ? [
            'TODO',
            'ASSIGNED',
            'IN_PROGRESS',
            'READY_FOR_QA',
            'QA_RUNNING',
            state,
          ]
        : [
            'TODO',
            'ASSIGNED',
            'IN_PROGRESS',
            'READY_FOR_QA',
            'QA_RUNNING',
            'QA_FAILED',
            ...(state === 'RETURNED_TO_OWNER'
              ? [state]
              : [
                  'RETURNED_TO_OWNER',
                  ...(state === 'FIXING' ? [state] : ['FIXING', state]),
                ]),
          ]
    await writeFile(
      record,
      task('WF-RECOVER', 'builder-a', 'docs/recover.md', state, history),
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
    task('WF-DELIVERY', 'builder-a', 'docs/delivery.md', 'ACCEPTED', [
      'TODO',
      'ASSIGNED',
      'IN_PROGRESS',
      'READY_FOR_QA',
      'QA_RUNNING',
      'QA_PASSED',
      'READY_FOR_INTEGRATION',
      'INTEGRATED',
      'ACCEPTED',
    ]).replace('qa_result: PENDING', 'qa_result: PASSED'),
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
  const incompleteMetadata = [
    '- Timestamp:',
    '- Session / role:',
    '- Execution mode:',
    '- Current goal: validate workflow',
    '- Completed task IDs and commits: WF-1 abc1234',
    '- Running task IDs / owners: none',
    '- Worktree, branch and dirty files: clean',
    '- Open defects: none',
    '- External blockers: none',
    '- Next safe action: handoff',
  ].join('\n')
  assert.match(
    validateCheckpointRecord(incompleteMetadata).join('\n'),
    /Timestamp/,
  )
  const complete = [
    '- Timestamp: 2026-10-15T18:00:00Z',
    '- Session / role: builder',
    '- Execution mode: serial-fallback',
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

test('requires a real commit before QA can start', async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const record = join(root, 'task.md')
  await writeFile(
    record,
    task(
      'WF-COMMIT',
      'builder-a',
      'docs/commit.md',
      'READY_FOR_QA',
      ['TODO', 'ASSIGNED', 'IN_PROGRESS', 'READY_FOR_QA'],
      'PENDING',
    ),
    'utf8',
  )
  assert.match(
    (await validateTaskRecord(record)).join('\n'),
    /requires a 40-character commit SHA before QA/,
  )
})

test('runs a mocked QA command and records the full QA state history', async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const record = join(root, 'task.md')
  await writeFile(
    record,
    task('WF-QA', 'builder-a', 'docs/qa.md')
      .replace(
        'worktree: C:/worktrees/builder-a',
        `worktree: ${root.replaceAll('\\', '/')}`,
      )
      .replace('  - node --test', '  - node -e "process.exit(0)"'),
    'utf8',
  )
  const result = await runQa(record, root)
  assert.equal(result.state, 'QA_PASSED')
  const saved = await readFile(record, 'utf8')
  assert.match(saved, /state: QA_PASSED/)
  assert.match(saved, /- QA_RUNNING[\s\S]*- QA_PASSED/)
})

test('returns a failed QA task to its recorded owner', async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const record = join(root, 'task.md')
  await writeFile(
    record,
    task('WF-QA-FAIL', 'builder-a', 'docs/qa-fail.md')
      .replace(
        'worktree: C:/worktrees/builder-a',
        `worktree: ${root.replaceAll('\\', '/')}`,
      )
      .replace('  - node --test', '  - node -e "process.exit(1)"'),
    'utf8',
  )
  const result = await runQa(record, root)
  assert.equal(result.state, 'RETURNED_TO_OWNER')
  const saved = await readFile(record, 'utf8')
  assert.match(saved, /state: RETURNED_TO_OWNER/)
  assert.match(saved, /- QA_FAILED[\s\S]*- RETURNED_TO_OWNER/)
})

test('creates separate temporary Git worktrees for parallel branches', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-git-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  git('init')
  git('config', 'user.email', 'workflow@example.test')
  git('config', 'user.name', 'Workflow Test')
  await writeFile(join(root, 'README.md'), 'base\n', 'utf8')
  git('add', 'README.md')
  git('commit', '-m', 'base')
  const left = join(root, 'left')
  const right = join(root, 'right')
  git('worktree', 'add', '-b', 'codex/left', left)
  git('worktree', 'add', '-b', 'codex/right', right)
  assert.notEqual(left, right)
  assert.equal(
    execFileSync('git', ['branch', '--show-current'], {
      cwd: left,
      encoding: 'utf8',
    }).trim(),
    'codex/left',
  )
  assert.equal(
    execFileSync('git', ['branch', '--show-current'], {
      cwd: right,
      encoding: 'utf8',
    }).trim(),
    'codex/right',
  )
})
