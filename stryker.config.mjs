// @ts-check
/**
 * Mutation testing: Stryker plants small bugs (mutants) in the product code and reruns the
 * unit + component suites. A mutant that survives is a behavior no test pins down.
 * Run on demand (`pnpm mutation`); report: reports/mutation/mutation.html.
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: [
    'lib/**/*.ts',
    'entrypoints/**/*.ts',
    'entrypoints/**/*.tsx',
    '!**/*.test.ts',
    '!**/*.test.tsx',
    // NOTE: bootstrap wiring only (listener registration, render call); exercised by E2E,
    // which Stryker cannot run.
    '!entrypoints/popup/main.tsx',
  ],
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  concurrency: 2,
  // Baseline 2026-11-06: 96.15%. The 17 survivors left are equivalent mutants (unique
  // request ids, constant effect deps, default arrays that can never match, fallbacks
  // whose falsy/undefined forms behave alike) or cosmetic (glyphs/whitespace inside
  // elements that already carry an accessible name).
  thresholds: { high: 95, low: 90, break: 91 },
};
