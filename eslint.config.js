import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Challenge brief §0: the simulation must stay independent from rendering, from React
 * and from browser globals, and must never read the wall clock or an unseeded RNG.
 * Imports alone do not cover that, so globals and property access are restricted too.
 */
const simulationIsolationRules = {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        { name: 'pixi.js', message: 'Simulation code must not import the renderer.' },
        { name: 'react', message: 'Simulation code must not import React.' },
        { name: 'react-dom', message: 'Simulation code must not import React DOM.' },
      ],
      patterns: [
        {
          group: [
            'pixi.js/*',
            'react/*',
            'react-dom/*',
            '**/game/render/**',
            '**/game/assets/**',
            '**/game/input/**',
            '**/ui/**',
            '**/api/**',
            '**/mocks/**',
            '**/storage/**',
          ],
          message:
            'Simulation code must stay independent from rendering, input, UI, network and persistence.',
        },
      ],
    },
  ],
  'no-restricted-globals': [
    'error',
    { name: 'window', message: 'Simulation code must not touch browser globals.' },
    { name: 'document', message: 'Simulation code must not touch browser globals.' },
    { name: 'navigator', message: 'Simulation code must not touch browser globals.' },
    { name: 'localStorage', message: 'Simulation code must not touch persistence.' },
    { name: 'sessionStorage', message: 'Simulation code must not touch persistence.' },
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Date', property: 'now', message: 'Use the injected Clock.' },
    { object: 'Math', property: 'random', message: 'Use the injected Rng.' },
    { object: 'performance', property: 'now', message: 'Use the injected Clock.' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date']",
      message: 'Use the injected Clock instead of constructing dates in the simulation.',
    },
  ],
}

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'public/assets',
      'public/mockServiceWorker.js',
      'e2e/__screenshots__',
      'docs/reference',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // The brief expresses config and contract types as intersections of type aliases
      // (`ShipStats & { ... }`, `MatchRecord & { rank }`), so type aliases are the house style.
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      // Numbers are allowed inside template literals (CLI reports, coordinates, timers);
      // any, nullish and boolean interpolation stay forbidden.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: false, allowNullish: false, allowAny: false },
      ],
    },
  },
  {
    files: ['src/game/sim/**/*.ts', 'src/game/core/**/*.ts'],
    rules: simulationIsolationRules,
  },
  {
    files: ['src/game/sim/**/*.ts'],
    rules: {
      // M2 acceptance, restated (docs/plan-deviations.md A7): gameplay tuning lives in src/config,
      // never in the systems. 0, 1 and 2 stay allowed as structural constants.
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          // -1/0/1/2 are signs and identities rather than balance values.
          ignore: [-1, 0, 1, 2],
          ignoreArrayIndexes: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
          enforceConst: true,
          detectObjects: true,
        },
      ],
    },
  },
  {
    files: [
      'eslint.config.js',
      'vite.config.ts',
      'playwright.config.ts',
      'scripts/**/*.ts',
      'e2e/**/*.{ts,mjs}',
    ],
    // Specs and acceptance scripts run in Node, but the callbacks handed to `page.evaluate` are browser
    // code, so both sets of globals are legitimate here.
    languageOptions: {
      globals: {
        ...globals.node,
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        KeyboardEvent: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
      },
    },
  },
  prettier,
)
