import { defineConfig } from 'vitest/config'

import { appCoverage } from './vitest.coverage.config.ts'

export default defineConfig({
  envDir: false,
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['tests/firebase/**/*.test.ts'],
    testTimeout: 15_000,
    coverage: appCoverage('./coverage/parts/firebase'),
  },
})
