import { defineConfig } from 'vitest/config'

import { assertTestNodeVersion } from './scripts/assert-test-node-version'
import { appCoverage } from './vitest.coverage.config.ts'

assertTestNodeVersion()

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
