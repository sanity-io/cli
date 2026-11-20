import path from 'node:path'

import {getCliConfig, getLocalPackageVersion, isInteractive} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {isWorkbenchApp} from '@sanity/workbench-cli'

import {installNewPackages} from '../../util/packageManager/installPackages.js'
import {getPackageManagerChoice} from '../../util/packageManager/packageManagerChoice.js'
import {type CodeMod} from './types.js'
import {upgradeRequiredPackages} from './upgradeRequiredPackages.js'

const MIN_SANITY_VERSION = '6.24.0'
const MIN_SDK_VERSION = '3.15.0'

const purpose = 'Migrate Dashboard tiles, asset sources and web workers to plain default exports'
const description = `
Rewrites the tile, asset source and web worker files declared in sanity.cli.ts (or .js) from
\`unstable_defineView\` and \`unstable_defineService\` to plain default exports. Views read their
props with \`useTile\` and \`useAssetSource\` from \`@sanity/sdk-react/dashboard\`. Web workers
receive \`{bus, worker}\`, typed with \`WebWorkerProps\` from \`@sanity/sdk/dashboard\`. Panel views
are left unchanged.

Installs @sanity/sdk-react (views) and @sanity/sdk (web workers) when they are missing, and
offers to upgrade sanity (older than ${MIN_SANITY_VERSION}) and those SDK packages (older than
${MIN_SDK_VERSION}).
`.trim()

export const dashboardViewsV1: CodeMod = {
  description,
  filename: 'dashboardViewsV1.ts',
  prepare: async ({dry, output, workDir}) => {
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

    const sdkPackages = [
      ...(views.length > 0 ? ['@sanity/sdk-react'] : []),
      ...(webWorkers.length > 0 ? ['@sanity/sdk'] : []),
    ]
    const installed = await Promise.all(
      sdkPackages.map((name) => getLocalPackageVersion(name, workDir)),
    )
    const missing = sdkPackages
      .filter((_, index) => !installed[index])
      .map((name) => `${name}@^${MIN_SDK_VERSION}`)
    const listOnly = dry || !isInteractive()

    if (missing.length > 0) {
      const packages = missing.join(', ')

      if (listOnly || !(await confirm({default: true, message: `Install ${packages} now?`}))) {
        output.log(`Install ${packages} before you run \`sanity dev\`.`)
      } else {
        const {chosen} = await getPackageManagerChoice(workDir, {interactive: false})
        await installNewPackages({packageManager: chosen, packages: missing}, {output, workDir})
      }
    }

    const neededBy = 'the migrated files need'
    await upgradeRequiredPackages(
      [
        {min: MIN_SANITY_VERSION, name: 'sanity', neededBy},
        ...sdkPackages.map((name) => ({min: MIN_SDK_VERSION, name, neededBy})),
      ],
      {dry: listOnly, output, workDir},
    )

    return {options: {}, paths}
  },
  purpose,
}
