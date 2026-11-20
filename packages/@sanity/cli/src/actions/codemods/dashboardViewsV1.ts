import path from 'node:path'

import {getCliConfig, getLocalPackageVersion} from '@sanity/cli-core'
import {isWorkbenchApp} from '@sanity/workbench-cli'
import {lt} from 'semver'

import {type CodeMod} from './types.js'

const MIN_SANITY_VERSION = '6.24.0'
const MIN_SDK_VERSION = '3.15.0'

const purpose = 'Migrate Dashboard tiles, asset sources and web workers to plain default exports'
const description = `
Rewrites the tile, asset source and web worker files declared in sanity.cli.ts (or .js) from
\`unstable_defineView\` and \`unstable_defineService\` to plain default exports. Views read their
props with \`useTile\` and \`useAssetSource\` from \`@sanity/sdk-react/dashboard\`. Web workers
receive \`{bus, worker}\`, typed with \`WebWorkerProps\` from \`@sanity/sdk/dashboard\`. Panel views
are left unchanged.

The migrated files need sanity ${MIN_SANITY_VERSION} or later, and @sanity/sdk-react (views) or
@sanity/sdk (web workers) ${MIN_SDK_VERSION} or later.
`.trim()

export const dashboardViewsV1: CodeMod = {
  description,
  filename: 'dashboardViewsV1.ts',
  prepare: async ({output, workDir}) => {
    const config = await getCliConfig(workDir)
    if (!isWorkbenchApp(config.app)) {
      throw new Error(
        'This project is not a Dashboard application. Run `sanity codemod dashboard` first.',
      )
    }

    const views = (config.app.views ?? []).filter((view) => view.surface !== 'window')
    const webWorkers = config.app.webWorkers ?? []
    const paths = [...views, ...webWorkers].map(({src}) => path.resolve(workDir, src))
    if (paths.length === 0) {
      throw new Error('sanity.cli.ts declares no views or web workers to migrate.')
    }

    const required = [
      ['sanity', MIN_SANITY_VERSION],
      ...(views.length > 0 ? [['@sanity/sdk-react', MIN_SDK_VERSION]] : []),
      ...(webWorkers.length > 0 ? [['@sanity/sdk', MIN_SDK_VERSION]] : []),
    ]
    for (const [name, min] of required) {
      const version = await getLocalPackageVersion(name, workDir)
      if (!version || lt(version, min)) {
        output.warn(
          `The migrated files need ${name} ${min} or later. Install or upgrade it before you run \`sanity dev\`.`,
        )
      }
    }

    return {options: {}, paths}
  },
  purpose,
}
