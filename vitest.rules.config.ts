import { defineConfig } from 'vitest/config'

export default defineConfig({
  envDir: false,
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 15_000,
  },
})
