import { Pool } from 'pg'

const startupDelaysMs = [250, 500, 1_000, 2_000, 4_000]

type Queryable = { query: (text: string) => Promise<unknown> }
type Sleep = (milliseconds: number) => Promise<void>

export function createPostgresPool(connectionString: string): Pool {
  return new Pool({ connectionString, connectionTimeoutMillis: 10_000 })
}

export async function waitForDatabase(
  pool: Queryable,
  sleep: Sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<void> {
  for (const [attempt, delay] of startupDelaysMs.entries()) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (error) {
      if (!isRetryableStartupError(error)) throw error
      await sleep(delay)
      if (attempt === startupDelaysMs.length - 1) break
    }
  }
  await pool.query('SELECT 1')
}

function isRetryableStartupError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = 'code' in error ? error.code : undefined
  return (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === '57P01' ||
    error.message === 'Connection terminated unexpectedly'
  )
}
