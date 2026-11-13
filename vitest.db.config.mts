import { defineConfig } from 'vitest/config'

/**
 * Database security suite.
 *
 * Separate from the frontend suite because it needs a live PostgreSQL
 * instance. Runs single-threaded: the tests share one connection and rely on
 * transaction rollback for isolation.
 */
export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
