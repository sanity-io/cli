import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import {createTypeScriptImportResolver} from 'eslint-import-resolver-typescript'
import {importX} from 'eslint-plugin-import-x'
import nodePlugin from 'eslint-plugin-n'
import {configs as perfectionistConfigs} from 'eslint-plugin-perfectionist'
import tsdoc from 'eslint-plugin-tsdoc'
import unicorn from 'eslint-plugin-unicorn'
import unusedImports from 'eslint-plugin-unused-imports'
import {defineConfig} from 'eslint/config'
import {configs} from 'typescript-eslint'

export default defineConfig(
  eslint.configs.recommended,
  configs.recommended,
  nodePlugin.configs['flat/recommended'],
  unicorn.configs['recommended'],
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  perfectionistConfigs['recommended-natural'],
  {
    rules: {
      'perfectionist/sort-imports': [
        'error',
        {
          environment: 'node',
          groups: [
            'type-import',
            'value-builtin',
            'value-external',
            'type-internal',
            'value-internal',
            ['type-parent', 'type-sibling', 'type-index'],
            ['value-parent', 'value-sibling', 'value-index'],
            'unknown',
          ],
          ignoreCase: true,
          newlinesBetween: 1,
          order: 'asc',
          partitionByComment: false,
          partitionByNewLine: false,
          specialCharacters: 'keep',
          type: 'natural',
        },
      ],
      'perfectionist/sort-objects': [
        'error',
        {
          partitionByNewLine: true,
          type: 'natural',
        },
      ],
    },
  },
  {
    plugins: {
      tsdoc,
    },
    rules: {
      'tsdoc/syntax': 'error',
    },
  },
  {
    files: ['test/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      'unicorn/no-useless-undefined': 'off',
    },
  },
  {
    plugins: {
      n: nodePlugin,
      'unused-imports': unusedImports,
    },
    rules: {
      '@typescript-eslint/no-dupe-class-members': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-useless-constructor': 'error',
      'import-x/consistent-type-specifier-style': ['error', 'prefer-inline'],
      'import-x/default': 'off',
      'import-x/first': 'error',
      'import-x/namespace': 'off',
      'import-x/newline-after-import': 'error',
      'import-x/no-cycle': 'error',
      'import-x/no-duplicates': [
        'error',
        {
          'prefer-inline': true,
        },
      ],
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            '**/*.test.ts',
            '**/*.test.tsx',
            '**/test/**',
            '**/config-eslint/**',
            '**/vite.config.ts',
            '**/eslint.config.mjs',
            '**/vitest.mjs',
            '**/vitest.config.ts',
            '**/vitest.config.mts',
            '**/package.bundle.ts',
            '**/package.config.ts',
            '**/knip.config.ts',
            '**/scripts/**',
          ],
          includeTypes: false,
          optionalDependencies: false,
        },
      ],
      'import-x/no-self-import': 'error',
      'import-x/no-unresolved': 'error',
      'n/hashbang': 0,
      'n/no-missing-import': 'off',
      'n/no-process-exit': 'off',
      'n/no-unsupported-features/es-syntax': 'off',
      'n/no-unsupported-features/node-builtins': [
        'error',
        {ignores: ['import.meta.dirname', 'fetch', 'Response', 'util.styleText']},
      ],
      'no-console': 'error',
      'no-dupe-class-members': 'off',
      'no-redeclare': 'off',
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
      'no-restricted-syntax': [
        'error',
        {
          message:
            'Dynamic imports are not allowed. Use `doImport` function from @sanity/cli-core instead.',
          selector: 'ImportExpression',
        },
      ],
      'no-unused-expressions': 'off',
      'no-unused-vars': 'off',
      'perfectionist/sort-classes': [
        'error',
        {
          groups: [
            'index-signature',
            'static-property',
            'property',
            'private-property',
            'constructor',
            'static-method',
            'static-private-method',
            ['get-method', 'set-method'],
            'method',
            'private-method',
            'unknown',
          ],
          order: 'asc',
          type: 'natural',
        },
      ],
      'perfectionist/sort-interfaces': [
        'error',
        {
          groups: [
            'index-signature',
            {newlinesBetween: 'ignore'},
            ['property', 'method'],
            {newlinesBetween: 1},
            ['optional-property', 'optional-method'],
            {newlinesBetween: 'ignore'},
          ],
          order: 'asc',
          type: 'natural',
        },
      ],
      'perfectionist/sort-modules': 'off',
      'perfectionist/sort-union-types': [
        'error',
        {
          groups: ['unknown', 'nullish'],
          order: 'asc',
          type: 'natural',
        },
      ],
      'unicorn/catch-error-name': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/import-style': [
        'error',
        {
          styles: {
            'node:path': {
              named: true,
            },
          },
        },
      ],
      'unicorn/no-await-expression-member': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-process-exit': 'off',
      'unicorn/prefer-module': 'warn',
      'unicorn/prevent-abbreviations': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          vars: 'all',
          varsIgnorePattern: '^_',
        },
      ],
    },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver()],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      'unicorn/prefer-string-raw': 'off',
    },
  },
  {
    files: ['**/ux/prompts.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              message: 'Use `util.styleText` from Node.js instead.',
              name: 'chalk',
            },
          ],
        },
      ],
    },
  },
  prettier,
)
