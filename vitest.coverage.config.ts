import type { CoverageV8Options } from 'vitest/node'

export function appCoverage(reportsDirectory: string): CoverageV8Options {
  return {
    provider: 'v8',
    reporter: ['json'],
    reportsDirectory,
    include: ['src/**/*.{ts,tsx}'],
    exclude: [
      'src/**/*.test.{ts,tsx}',
      'src/**/*.d.ts',
      'src/**/testFixtures.ts',
      'src/test/**',
    ],
  }
}
