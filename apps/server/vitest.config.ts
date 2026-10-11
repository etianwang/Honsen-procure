import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // PostgreSQL integration files each initialize the same disposable schema.
    fileParallelism: false,
  },
})
