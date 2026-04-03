import {type KnipConfig} from 'knip'

const project = ['src/**/*.{js,jsx,ts,tsx}', '!**/docs/**']

const baseConfig = {
  // For now only care about cli package
  ignore: [
    // See `helpClass` in `oclif.config.js`
    'packages/@sanity/cli/src/SanityHelp.ts',
  ],
  workspaces: {
    'fixtures/*': {
      project: ['schemaTypes/**/*.{js,jsx,ts,tsx}'],
    },
    'fixtures/basic-app': {
      entry: ['./src/App.tsx'],
      project,
    },
    'fixtures/basic-functions': {
      entry: ['functions/**/*.{js,jsx,ts,tsx}'],
      // Used for CLI
      ignoreDependencies: ['sanity'],
    },
    'fixtures/prebuilt-app': {
      entry: ['src/App.tsx'],
      project,
    },
    'fixtures/prebuilt-studio': {
      project: [],
    },
    'fixtures/worst-case-studio': {
      entry: ['src/defines.ts'],
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
    'packages/@sanity/cli-e2e': {
      entry: [],
      // @sanity/cli and create-sanity are resolved dynamically via require.resolve() in packCli.ts
      ignoreDependencies: ['@sanity/cli', 'create-sanity'],
      project: ['helpers/**/*.{js,ts}', '__tests__/**/*.{js,ts}'],
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
