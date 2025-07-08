import {join} from 'node:path'

import {type KnipConfig} from 'knip'
import {match} from 'minimatch'

const project = ['src/**/*.{js,jsx,ts,tsx}', '!**/build/**', '!**/docs/**']

const baseConfig = {
  // For now only care about cli package
  ignore: [
    'packages/@sanity/original-cli/**',
    'packages/@sanity/migrate/**',
    'packages/@sanity/codegen/**',
    'packages/@sanity/blueprints/**',
    'packages/create-sanity/**',

    // See `helpClass` in `oclif.config.js`
    'packages/@sanity/cli/src/SanityHelp.ts',
  ],
  workspaces: {
    '.': {
      entry: ['package.config.ts', 'vitest.config.ts', 'eslint.config.mjs'],
    },
    'examples/*': {
      entry: ['sanity.cli.ts', 'blueprint.ts', 'sanity.config.ts'],
      project,
    },
    'examples/basic-app': {
      entry: ['sanity.cli.ts', './src/App.tsx'],
      project,
    },
    'examples/worst-case-studio': {
      entry: ['sanity.cli.ts', 'sanity.config.tsx', 'sanity.config.ts', 'src/defines.ts'],
      project,
    },
    'packages/@repo/dev-aliases': {
      entry: ['dev-aliases.cjs', 'vite.mjs'],
      project,
    },
    'packages/@sanity/cli': {
      entry: [
        'src/commands/**/*.ts',
        'test/helpers/testCommand.ts',
        // Worker files
        'src/**/*.worker.ts',
        'src/**/*.worker.js',
      ],
      oclif: {
        config: ['oclif.config.js'],
      },
      project,
    },
  },
} satisfies KnipConfig

export const addBundlerEntries = async (config: KnipConfig): Promise<KnipConfig> => {
  const dirs = ['packages/@repo/eslint-config', 'packages/@repo/tsconfig', 'packages/@sanity/cli']

  for (const wsDir of dirs) {
    for (const configKey of Object.keys(baseConfig.workspaces)) {
      if (match([wsDir], configKey)) {
        const manifest = await import(join(__dirname, wsDir, 'package.json'))
        const configEntries = (config?.workspaces?.[configKey].entry as string[]) ?? []
        const bundler = manifest?.bundler
        for (const value of Object.values(bundler ?? {})) {
          if (Array.isArray(value)) {
            configEntries.push(...value)
          }
        }
        // Add package.config.ts to entry points
        configEntries.push('package.config.ts')
        if (config.workspaces && config.workspaces[configKey]) {
          config.workspaces[configKey].entry = [...new Set(configEntries)]
        }
      }
    }
  }

  return config
}

export default addBundlerEntries(baseConfig)
