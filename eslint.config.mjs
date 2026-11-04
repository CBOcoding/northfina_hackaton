// ESLint flat config. Run `npm run lint` (CI fails on any warning).
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'coverage/**',
    'src/generated/**',
    'prisma/migrations/**',
    'next-env.d.ts',
  ]),

  js.configs.recommended,
  tseslint.configs.recommended,

  // React and Next.js rules for the app.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [nextPlugin.configs['core-web-vitals'], reactHooks.configs.flat.recommended],
  },

  // Node scripts and config files.
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // src/domain is pure: no I/O, no framework, no clock, no randomness.
  // Everything a function needs (data, today's date) is passed in as an argument.
  {
    files: ['src/domain/**/*.ts'],
    ignores: ['src/domain/**/*.test.ts'],
    rules: {
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'fs',
                'fs/*',
                'path',
                'child_process',
                'http',
                'https',
                'next',
                'next/*',
                'react',
                'react-dom',
                '@prisma/*',
                '@/generated/*',
                '@/server/*',
                '@/data/load',
                '@/app/*',
              ],
              message: 'src/domain is pure: pass data in as arguments instead of importing I/O.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'src/domain does no I/O.' },
        { name: 'process', message: 'src/domain does not read the environment.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Pass today in as an ISO date string.' },
        { object: 'Math', property: 'random', message: 'Domain functions are deterministic.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'new Date() reads the clock. Pass today in as an ISO date string.',
        },
      ],
    },
  },
]);
