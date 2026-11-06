import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { Pool } from 'pg'
import { recoverAdmin } from '../../apps/server/dist/auth/recover-admin.js'

// POSTGRES_URL must be an explicitly supplied maintenance-owner connection.
// Do not load the API .env, accept argv passwords, or provide a default password.
if (!process.stdin.isTTY || !process.stdout.isTTY)
  throw new Error('INTERACTIVE_TERMINAL_REQUIRED')
if (!process.env.POSTGRES_URL)
  throw new Error('MAINTENANCE_POSTGRES_URL_REQUIRED')
let muted = false
const output = new Writable({
  write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk, encoding)
    done()
  },
})
const rl = createInterface({ input: process.stdin, output, terminal: true })
const pool = new Pool({ connectionString: process.env.POSTGRES_URL })
try {
  const operator = await rl.question('维护人员身份（写入审计）: ')
  const reason = await rl.question('恢复原因（写入审计）: ')
  process.stdout.write('新密码（12–1024字符，不显示）: ')
  muted = true
  const password = await rl.question('')
  process.stdout.write('\n再次输入新密码: ')
  const confirmation = await rl.question('')
  muted = false
  process.stdout.write('\n')
  if (password !== confirmation)
    throw new Error('PASSWORD_CONFIRMATION_MISMATCH')
  await recoverAdmin(pool, { password, operator, reason })
  console.log('恢复成功：保留原 admin ID、角色和历史；旧会话已全部撤销。')
} catch (error) {
  console.error(
    '恢复失败；未提交更改：',
    error instanceof Error ? error.message : 'RECOVERY_FAILED',
  )
  process.exitCode = 1
} finally {
  rl.close()
  await pool.end()
}
