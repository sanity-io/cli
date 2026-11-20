import baseConfig from '@repo/oxc-config/oxlint'
import {defineConfig} from 'oxlint'

export default defineConfig({
  ...baseConfig,
  ignorePatterns: [...baseConfig.ignorePatterns!, 'templates/**'],
  overrides: [
    ...baseConfig.overrides!,
    {
      files: ['**/*'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                message:
                  "Import from subpath instead to avoid barrel import. Example: `import {fn} from 'date-fns/fn'`.",
                name: 'date-fns',
              },
              {
                message:
                  "Import from subpath instead to avoid barrel import. Example: `import fn from 'lodash-es/fn.js'`.",
                name: 'lodash-es',
              },
              {
                allowTypeImports: true,
                message:
                  'Importing from sanity directly is not allowed. Use `resolveLocalPackage` function from @sanity/cli-core instead.',
                name: 'sanity',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                message:
                  'Import prompts from `@sanity/cli-core/ux` instead, which includes non-interactive environment safety checks.',
                name: '@inquirer/prompts',
              },
              {
                message: 'Use `util.styleText` from Node.js instead.',
                name: 'chalk',
              },
              {
                message: "Import from 'zod/mini' instead for smaller bundle size.",
                name: 'zod',
              },
              {
                message:
                  "Import from subpath instead to avoid barrel import. Example: `import {fn} from 'date-fns/fn'`.",
                name: 'date-fns',
              },
              {
                message:
                  "Import from subpath instead to avoid barrel import. Example: `import fn from 'lodash-es/fn.js'`.",
                name: 'lodash-es',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/commands/**/*.ts'],
      rules: {
        'eslint-js/no-restricted-syntax': [
          'error',
          {
            message:
              'Dynamic imports are not allowed. Use `doImport` function from @sanity/cli-core instead.',
            selector: 'ImportExpression',
          },
          {
            message: 'Use `this.resolveIsInteractive()` instead of `process.stderr.isTTY`.',
            selector:
              "MemberExpression[property.name='isTTY'][object.type='MemberExpression'][object.object.name='process'][object.property.name='stderr']",
          },
          {
            message: 'Use a named value from `exitCodes` instead of a raw exit code number.',
            selector: "Property[key.name='exit'][value.type='Literal'][value.raw=/^[0-9]+$/]",
          },
          {
            message: 'Use a named value from `exitCodes` instead of a raw exit code number.',
            selector:
              "CallExpression[callee.type='MemberExpression'][callee.property.name='exit'][arguments.0.type='Literal'][arguments.0.raw=/^[0-9]+$/]",
          },
        ],
        // `printTable()` writes straight to `console.log`, which bypasses the
        // command output sink. Programmatic callers read only from that sink, so
        // the table is silently dropped for them.
        'no-restricted-properties': [
          'error',
          {
            message:
              'Use `this.log(table.render())` instead. `printTable()` writes directly to the console, so its output is lost for programmatic callers.',
            property: 'printTable',
          },
        ],
      },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**/*.ts'],
      rules: {
        'eslint-js/no-restricted-syntax': 'off',
      },
    },
    {
      // Fixtures stand in for packages outside this one, so they import as
      // their real counterparts would rather than as this package's own source.
      files: ['test/__fixtures__/**/*.{ts,js}'],
      rules: {
        'import-js/no-extraneous-dependencies': 'off',
        'import-js/no-unresolved': 'off',
        'n-js/no-extraneous-import': 'off',
      },
    },
  ],
  rules: {...baseConfig.rules, 'typescript/no-explicit-any': 'warn'},
})
