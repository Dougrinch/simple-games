import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

import { assertTestNodeVersion } from '../scripts/assert-test-node-version'

assertTestNodeVersion()

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './test/config/wrangler.jsonc' },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'istanbul',
      reporter: ['json'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
    },
  },
})
