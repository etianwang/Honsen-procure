import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const workflowFiles = [
  'README.md',
  'WORKFLOW.md',
  'BUILDER.md',
  'FIXER.md',
  'ORCHESTRATOR.md',
  'QA.md',
  'WORKTREE.md',
  'RECOVERY.md',
  'project.example.yaml',
]
const coordinationFiles = [
  'TASKBOARD.md',
  'INTERFACE-CONTRACTS.md',
  'DELIVERIES.md',
  'DEFECTS.md',
  'INTEGRATION.md',
  'CHECKPOINTS.md',
]
const activeStates = new Set([
  'ASSIGNED',
  'IN_PROGRESS',
  'READY_FOR_QA',
  'QA_RUNNING',
  'QA_FAILED',
  'RETURNED_TO_OWNER',
  'FIXING',
  'QA_PASSED',
  'READY_FOR_INTEGRATION',
  'INTEGRATED',
])
const transitions = new Map([
  ['TODO', new Set(['ASSIGNED'])],
  ['ASSIGNED', new Set(['IN_PROGRESS'])],
  ['IN_PROGRESS', new Set(['READY_FOR_QA'])],
  ['READY_FOR_QA', new Set(['QA_RUNNING'])],
  ['QA_RUNNING', new Set(['QA_PASSED', 'QA_FAILED'])],
  ['QA_PASSED', new Set(['READY_FOR_INTEGRATION'])],
  ['READY_FOR_INTEGRATION', new Set(['INTEGRATED'])],
  ['INTEGRATED', new Set(['ACCEPTED'])],
  ['QA_FAILED', new Set(['RETURNED_TO_OWNER'])],
  ['RETURNED_TO_OWNER', new Set(['FIXING'])],
  ['FIXING', new Set(['READY_FOR_QA'])],
])

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function frontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null
  const values = {}
  const lines = match[1].split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const field = lines[index].match(/^([a-z_]+):\s*(.*)$/)
    if (!field) continue
    const [, key, raw] = field
    if (raw !== '') {
      values[key] = raw.trim()
      continue
    }
    const list = []
    while (lines[index + 1]?.match(/^\s+-\s+/))
      list.push(lines[++index].replace(/^\s+-\s+/, '').trim())
    values[key] = list
  }
  return values
}

export function validateCheckpointRecord(text) {
  const errors = []
  for (const field of [
    'Timestamp:',
    'Session / role:',
    'Execution mode:',
    'Current goal:',
    'Completed task IDs and commits:',
    'Running task IDs / owners:',
    'Worktree, branch and dirty files:',
    'Open defects:',
    'External blockers:',
    'Next safe action:',
  ]) {
    const match = text.match(
      new RegExp(
        `^- ${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*(.+)$`,
        'm',
      ),
    )
    if (!match || !match[1].trim()) errors.push(`Checkpoint missing ${field}`)
  }
  return errors
}

export async function validateWorkflow(root = process.cwd()) {
  const errors = []
  const workflowRoot = join(
    root,
    '.agents',
    'workflows',
    'multi-agent-workflow',
  )
  for (const file of workflowFiles)
    if (!(await exists(join(workflowRoot, file))))
      errors.push(`Missing workflow file: ${file}`)
  for (const file of coordinationFiles)
    if (!(await exists(join(root, 'docs', 'agent-coordination', file))))
      errors.push(`Missing coordination file: ${file}`)
  const skill = join(root, 'skills', 'multi-agent-workflow', 'SKILL.md')
  if (!(await exists(skill)))
    errors.push(
      'Missing global skill source: skills/multi-agent-workflow/SKILL.md',
    )
  else {
    const content = await readFile(skill, 'utf8')
    if (
      !/^---\r?\nname: multi-agent-workflow\r?\ndescription: .+/m.test(content)
    )
      errors.push('Skill frontmatter must declare name and description')
  }
  const config = join(workflowRoot, 'project.example.yaml')
  if (await exists(config)) {
    const content = await readFile(config, 'utf8')
    for (const key of [
      'workflow_version:',
      'coordination_dir:',
      'task_directory:',
    ])
      if (!content.includes(key)) errors.push(`Configuration missing ${key}`)
  }
  return errors
}

export async function validateTaskRecord(taskPath) {
  const errors = []
  const values = frontMatter(await readFile(taskPath, 'utf8'))
  if (!values) return ['Task record requires YAML frontmatter']
  for (const field of [
    'task_id',
    'state',
    'owner',
    'worktree',
    'branch',
    'commit',
    'dependencies',
    'owned_files',
    'test_commands',
    'test_log',
    'qa_result',
    'repair_round',
    'acceptance_evidence',
    'state_history',
  ]) {
    if (values[field] === undefined || values[field] === '')
      errors.push(`Task record missing ${field}`)
  }
  if (!transitions.has(values.state) && values.state !== 'ACCEPTED')
    errors.push(`Unknown task state: ${values.state}`)
  if (!Array.isArray(values.state_history) || values.state_history.length === 0)
    errors.push('Task record requires non-empty state_history')
  else {
    if (values.state_history[0] !== 'TODO')
      errors.push('State history must start at TODO')
    if (values.state_history.at(-1) !== values.state)
      errors.push('Task state must equal the final state_history entry')
    for (let index = 1; index < values.state_history.length; index += 1) {
      const previous = values.state_history[index - 1]
      const next = values.state_history[index]
      if (!transitions.get(previous)?.has(next))
        errors.push(`Illegal state history transition: ${previous} -> ${next}`)
    }
  }
  if (values.commit && !/^(?:[0-9a-f]{40}|PENDING)$/i.test(values.commit))
    errors.push('Commit must be a 40-character SHA or PENDING')
  if (
    [
      'READY_FOR_QA',
      'QA_RUNNING',
      'QA_PASSED',
      'QA_FAILED',
      'RETURNED_TO_OWNER',
      'FIXING',
      'READY_FOR_INTEGRATION',
      'INTEGRATED',
      'ACCEPTED',
    ].includes(values.state) &&
    !/^[0-9a-f]{40}$/i.test(values.commit ?? '')
  )
    errors.push(
      `Task in ${values.state} requires a 40-character commit SHA before QA`,
    )
  if (!Array.isArray(values.owned_files) || values.owned_files.length === 0)
    errors.push('Task record requires at least one owned_files entry')
  if (
    !Number.isInteger(Number(values.repair_round)) ||
    Number(values.repair_round) < 0
  )
    errors.push('repair_round must be a non-negative integer')
  return errors
}

async function markdownFiles(directory) {
  if (!(await exists(directory))) return []
  const result = []
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isDirectory()) result.push(...(await markdownFiles(path)))
    else if (item.isFile() && item.name.endsWith('.md')) result.push(path)
  }
  return result
}

export async function validateOwnership(tasksDirectory) {
  const errors = []
  const owners = new Map()
  for (const record of await markdownFiles(tasksDirectory)) {
    const values = frontMatter(await readFile(record, 'utf8'))
    if (
      !values ||
      !activeStates.has(values.state) ||
      !Array.isArray(values.owned_files)
    )
      continue
    for (const file of values.owned_files) {
      const existing = owners.get(file)
      if (existing && existing.task !== values.task_id)
        errors.push(
          `File ownership collision: ${file} is owned by ${existing.task} and ${values.task_id}`,
        )
      else owners.set(file, { task: values.task_id, owner: values.owner })
    }
  }
  return errors
}

async function main() {
  const args = process.argv.slice(2)
  const option = (name) => args[args.indexOf(name) + 1]
  const root = resolve(option('--root') ?? process.cwd())
  let errors = await validateWorkflow(root)
  if (option('--task'))
    errors = errors.concat(
      await validateTaskRecord(resolve(root, option('--task'))),
    )
  if (args.includes('--ownership'))
    errors = errors.concat(
      await validateOwnership(
        join(root, 'docs', 'agent-coordination', 'tasks'),
      ),
    )
  if (errors.length) {
    console.error(errors.map((error) => `ERROR: ${error}`).join('\n'))
    process.exitCode = 1
  } else console.log('Workflow validation passed.')
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`)
  await main()
