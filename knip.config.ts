import {type KnipConfig} from 'knip'

const project = ['src/**/*.{js,jsx,ts,tsx}', '!**/docs/**']

const baseConfig = {
  // For now only care about cli package
  ignore: [
    'packages/@sanity/cli-test/fixtures/**',

    // See `helpClass` in `oclif.config.js`
    'packages/@sanity/cli/src/SanityHelp.ts',
  ],
  workspaces: {
    'fixtures/*': {
      entry: ['sanity.cli.ts', 'sanity.config.ts'],
      project: ['schemaTypes/**/*.{js,jsx,ts,tsx}'],
    },
    'fixtures/basic-app': {
      entry: ['sanity.cli.ts', './src/App.tsx'],
      project,
    },
    'fixtures/basic-functions': {
      entry: ['sanity.blueprint.ts', 'functions/**/*.{js,jsx,ts,tsx}'],
      // Used for CLI
      ignoreDependencies: ['sanity'],
    },
    'fixtures/prebuilt-app': {
      entry: ['sanity.cli.ts', 'src/App.tsx'],
      project,
    },
    'fixtures/prebuilt-studio': {
      entry: ['sanity.cli.ts', 'sanity.config.ts'],
      project: [],
    },
    'fixtures/worst-case-studio': {
      entry: ['sanity.cli.ts', 'sanity.config.tsx', 'src/defines.ts'],
      project,
    },
    'packages/@repo/coverage-delta': {
      project,
    },
    'packages/@repo/upload-docs': {
      project,
    },
    'packages/@sanity/cli': {
      entry: [
        // Commands
        'src/commands/**/*.ts',
        // Hooks
        'src/hooks/**/*.ts',
        // Worker files
        'src/**/*.worker.ts',
        'package.config.ts',
      ],
      // Claude, Codex, and OpenCode are not dependencies of the CLI, but they are used in MCP configuration
      ignoreBinaries: ['claude', 'codex', 'opencode'],
      oclif: {
        config: ['oclif.config.js'],
      },
      project,
    },
    'packages/@sanity/cli-core': {
      entry: [
        // Worker files
        'src/**/*.worker.ts',
        'package.config.ts',
      ],
      project,
    },
    'packages/@sanity/cli-test': {
      entry: ['package.config.ts'],
      project,
    },
    'packages/create-sanity': {
      ignoreDependencies: ['@sanity/cli'],
    },
  },
} satisfies KnipConfig

export default baseConfig
