import {join} from 'node:path'

import {type KnipConfig} from 'knip'
import {match} from 'minimatch'

const project = ['src/**/*.{js,jsx,ts,tsx}', '!**/docs/**']

const baseConfig = {
  // For now only care about cli package
  ignore: [
    'packages/@sanity/original-cli/**',
    'packages/@sanity/migrate/**',
    'packages/@sanity/codegen/**',
    'packages/create-sanity/**',

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
      // temporarily ignore unused exports until schema work is done
      ignore: [
        'src/actions/manifest/extractManifest.ts',
        'src/actions/manifest/types.ts',
        // Schema utilities used by future deploy and list commands
        'src/actions/schema/schemaStoreConstants.ts',
        'src/actions/schema/utils/schemaActionHelpers.ts',
        'src/actions/schema/utils/workspaceSchemaId.ts',
        'src/actions/schema/utils/schemaStoreOutStrings.ts',
        'src/actions/schema/utils/schemaStoreValidation.ts',
        'src/actions/schema/utils/manifestReader.ts',
      ],
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
  },
} satisfies KnipConfig

export const addBundlerEntries = async (config: KnipConfig): Promise<KnipConfig> => {
  const dirs = ['packages/@repo/eslint-config', 'packages/@repo/tsconfig', 'packages/@sanity/cli']

  for (const wsDir of dirs) {
    for (const configKey of Object.keys(baseConfig.workspaces)) {
      if (match([wsDir], configKey)) {
        const manifest = await import(join(import.meta.dirname, wsDir, 'package.json'))
        const configEntries = (config?.workspaces?.[configKey].entry as string[]) ?? []
        const bundler = manifest?.bundler
        for (const value of Object.values(bundler ?? {})) {
          if (Array.isArray(value)) {
            configEntries.push(...value)
          }
        }
        // Add package.config.ts to entry points
        // configEntries.push('package.config.ts')
        if (config.workspaces && config.workspaces[configKey]) {
          config.workspaces[configKey].entry = [...new Set(configEntries)]
        }
      }
    }
  }

  return config
}

export default addBundlerEntries(baseConfig)
