import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

function normalizeBasePath(value: string | undefined): string {
  const basePath = value?.trim() || '/'

  if (!basePath.startsWith('/') || !basePath.endsWith('/')) {
    throw new Error('VITE_BASE_PATH must start and end with "/".')
  }

  return basePath
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: normalizeBasePath(env.VITE_BASE_PATH),
    plugins: [react()],
    test: {
      environment: 'jsdom',
      exclude: ['tests/rules/**', 'node_modules/**', 'dist/**'],
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: './src/test/setup.ts',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        reportsDirectory: './coverage',
      },
    },
  }
})
