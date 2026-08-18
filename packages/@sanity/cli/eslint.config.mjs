import {resolve} from 'node:path'

import {includeIgnoreFile} from '@eslint/compat'
import eslintConfig from '@sanity/eslint-config-cli'

export default [
  includeIgnoreFile(resolve(import.meta.dirname, '.gitignore')),
  {
    ignores: ['templates/**'],
  },
  ...eslintConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*'],
    ignores: ['**/*.test.ts'],
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
    files: ['src/commands/**/*.ts'],
    rules: {
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
    files: ['src/commands/**/*.ts'],
    ignores: ['src/commands/**/*.test.ts', 'src/commands/**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
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
    },
  },
  {
    files: ['test/__fixtures__/**/*.ts'],
    rules: {
      'import-x/no-extraneous-dependencies': 'off',
      'import-x/no-unresolved': 'off',
    },
  },
]
