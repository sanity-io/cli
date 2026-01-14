import {type KnipConfig} from 'knip'

const project = ['src/**/*.{js,jsx,ts,tsx}', '!**/docs/**']

const baseConfig = {
  // For now only care about cli package
  ignore: [
    'packages/@sanity/original-cli/**',

    // See `helpClass` in `oclif.config.js`
    'packages/@sanity/cli/src/SanityHelp.ts',
  ],
  workspaces: {
    'examples/*': {
      entry: ['sanity.cli.ts', 'sanity.config.ts'],
      project: ['schemaTypes/**/*.{js,jsx,ts,tsx}'],
    },
    'examples/basic-app': {
      entry: ['sanity.cli.ts', './src/App.tsx'],
      project,
    },
    'examples/worst-case-studio': {
      entry: ['sanity.cli.ts', 'sanity.config.tsx', 'src/defines.ts'],
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
      ],
      ignore: [
        // Ignore exports until init work is done
        'src/actions/init/remoteTemplate.ts',
        'src/actions/init/determineAppTemplate.ts',
        'src/actions/auth/login.ts',
        'src/services/organizations.ts',
        'src/services/projects.ts',
        'src/prompts/init/index.ts',
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
      ],
      project,
    },
    'packages/@sanity/cli-test': {
      project,
    },
    'packages/create-sanity': {
      ignoreDependencies: ['@sanity/cli'],
    },
  },
} satisfies KnipConfig

export default baseConfig
