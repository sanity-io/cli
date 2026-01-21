import {type KnipConfig} from 'knip'

const project = ['src/**/*.{js,jsx,ts,tsx}', '!**/docs/**']

const baseConfig = {
  // For now only care about cli package
  ignore: [
    'packages/@sanity/original-cli/**',
    'packages/@sanity/cli-test/examples/**',

    // See `helpClass` in `oclif.config.js`
    'packages/@sanity/cli/src/SanityHelp.ts',
  ],
  workspaces: {
    'examples/*': {
      entry: ['sanity.cli.ts', 'sanity.config.ts'],
      // Binary is overridden by the CLI package
      ignoreBinaries: ['sanity'],
      project: ['schemaTypes/**/*.{js,jsx,ts,tsx}'],
    },
    'examples/basic-app': {
      entry: ['sanity.cli.ts', './src/App.tsx'],
      // Binary is overridden by the CLI package
      ignoreBinaries: ['sanity'],
      project,
    },
    'examples/worst-case-studio': {
      entry: ['sanity.cli.ts', 'sanity.config.tsx', 'src/defines.ts'],
      // Binary is overridden by the CLI package
      ignoreBinaries: ['sanity'],
      project,
    },
    'packages/@repo/command-extractor': {
      // Needed for npx to work
      ignoreDependencies: ['@sanity/cli'],
      project,
    },
    'packages/@sanity/cli': {
      entry: [
        'src/commands/**/*.ts',
        // Worker files
        'src/**/*.worker.ts',
        // certain threads files are used via loader, not import
        'src/threads/configClient.ts',
        'src/threads/registerBrowserEnv.ts',
        'package.config.ts',
      ],
      ignore: [
        // Ignore exports until init work is done
        'src/actions/init/remoteTemplate.ts',
        'src/actions/init/determineAppTemplate.ts',
        'src/actions/auth/login.ts',
        'src/services/organizations.ts',
        'src/services/projects.ts',
        'src/prompts/init/index.ts',
        'src/prompts/init/promptForTypescript.ts',
        'src/actions/init/setupMCP.ts',
      ],
      // Claude is not a dependency of the CLI, but it is used in the MCP configuration
      ignoreBinaries: ['claude'],
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
