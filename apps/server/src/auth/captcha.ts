import { randomUUID } from 'node:crypto'

type CaptchaRecord = { answer: string; expiresAt: number }

export class CaptchaStore {
  readonly #records = new Map<string, CaptchaRecord>()

  issue(now = Date.now()): { id: string; question: string; expiresAt: string } {
    const left = 1 + Math.floor(Math.random() * 9)
    const right = 1 + Math.floor(Math.random() * 9)
    const id = randomUUID()
    const expiresAt = now + 5 * 60 * 1000
    this.#records.set(id, { answer: String(left + right), expiresAt })
    return {
      id,
      question: `${left} + ${right} = ?`,
      expiresAt: new Date(expiresAt).toISOString(),
    }
  }

  consume(id: string, answer: string, now = Date.now()): boolean {
    const record = this.#records.get(id)
    this.#records.delete(id)
    return (
      record !== undefined &&
      record.expiresAt >= now &&
      record.answer === answer
    )
  }
}
