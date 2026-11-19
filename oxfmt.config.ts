import sanityOxfmtConfig from '@sanity/oxfmt-config'
import {defineConfig} from 'oxfmt'

export default defineConfig({
  ...sanityOxfmtConfig,
  ignorePatterns: [
    '.vscode',
    '.turbo',
    '/packages/*/lib',
    '/packages/*/.turbo',
    '/packages/@sanity/*/lib',
    '/packages/@sanity/*/.turbo',
    'pnpm-lock.yaml',
    'CHANGELOG.md',
    '.release-please-manifest.json',
    '**/tsconfig.json',
    '**/__snapshots__/**',
    '**/src/generated/**',
    '.claude',
    '.changeset',
    '**/dist/**',
    '**/lib/**',
  ],
  overrides: [
    {
      files: ['packages/@sanity/cli/templates/**', '**/*.md'],
      options: {
        sortImports: false,
      },
    },
  ],
  sortImports: {
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
  },
  sortPackageJson: {},
})
