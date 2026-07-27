import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          VAPID_PRIVATE_KEY: 'test-private-key',
        },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
})
