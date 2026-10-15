import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'

import { validateTaskRecord } from './validate-workflow.mjs'

function scalar(text, key) {
  return text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim()
}

function commands(text) {
  const match = text.match(/^test_commands:\r?\n((?:\s+-\s+.+\r?\n?)+)/m)
  return match
    ? [...match[1].matchAll(/^\s+-\s+(.+)$/gm)].map((item) => item[1])
    : []
}

function transition(text, state, result) {
  const withState = text.replace(/^state:\s*.+$/m, `state: ${state}`)
  const withResult = withState.replace(
    /^qa_result:\s*.+$/m,
    `qa_result: ${result}`,
  )
  return withResult.replace(
    /^(state_history:\r?\n(?:\s+-\s+.+\r?\n)+)(---)$/m,
    `$1  - ${state}\n$2`,
  )
}

function run(command, cwd) {
  return new Promise((resolveRun) => {
    const process = spawn(command, { cwd, shell: true })
    let output = ''
    process.stdout.on('data', (data) => (output += data))
    process.stderr.on('data', (data) => (output += data))
    process.on('close', (code) =>
      resolveRun({ command, code: code ?? 1, output }),
    )
  })
}

export async function runQa(taskPath, root = process.cwd()) {
  let text = await readFile(taskPath, 'utf8')
  if (scalar(text, 'state') !== 'READY_FOR_QA')
    throw new Error('QA runner accepts only READY_FOR_QA tasks')
  const validation = await validateTaskRecord(taskPath)
  if (validation.length) throw new Error(validation.join('\n'))
  const worktree = scalar(text, 'worktree')
  const log = resolve(root, scalar(text, 'test_log'))
  text = transition(text, 'QA_RUNNING', 'RUNNING')
  await writeFile(taskPath, text, 'utf8')
  const results = []
  for (const command of commands(text)) {
    const result = await run(command, worktree)
    results.push(result)
    if (result.code !== 0) break
  }
  const passed =
    results.length > 0 && results.every((result) => result.code === 0)
  text = transition(
    await readFile(taskPath, 'utf8'),
    passed ? 'QA_PASSED' : 'QA_FAILED',
    passed ? 'PASSED' : 'FAILED',
  )
  if (!passed) text = transition(text, 'RETURNED_TO_OWNER', 'FAILED')
  await mkdir(dirname(log), { recursive: true })
  await writeFile(
    log,
    results
      .map(
        (result) =>
          `$ ${result.command}\n${result.output}\nexit=${result.code}\n`,
      )
      .join('\n'),
    'utf8',
  )
  await writeFile(taskPath, text, 'utf8')
  return { state: passed ? 'QA_PASSED' : 'RETURNED_TO_OWNER', log }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const taskPath = process.argv[2]
  if (!taskPath) throw new Error('Usage: node run-qa.mjs <task-record>')
  const result = await runQa(resolve(taskPath), process.cwd())
  console.log(`QA ${result.state}: ${result.log}`)
}
