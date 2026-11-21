import path from 'node:path'

import {getCliConfig, getLocalPackageVersion, isInteractive} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {isWorkbenchApp} from '@sanity/cli-core/workbench'

import {installNewPackages} from '../../util/packageManager/installPackages.js'
import {getPackageManagerChoice} from '../../util/packageManager/packageManagerChoice.js'
import {type CodeMod} from './types.js'
import {upgradeRequiredPackages} from './upgradeRequiredPackages.js'

const MIN_SDK_VERSION = '3.15.0'

const purpose = 'Migrate Dashboard tiles, asset sources and web workers to plain default exports'
const description = `
Rewrites the tile, asset source and web worker files declared in sanity.cli.ts (or .js) from
\`unstable_defineView\` and \`unstable_defineService\` to plain default exports. Views read their
props with \`useTile\` and \`useAssetSource\` from \`@sanity/sdk-react/dashboard\`. Web workers
receive \`{bus, worker}\`, typed with \`WebWorkerProps\`. Panel views are left unchanged.

The migrated files import from @sanity/sdk-react, or from @sanity/sdk in projects that have only
web workers and no @sanity/sdk-react. Installs that package when it is missing and offers to
upgrade it when it is older than ${MIN_SDK_VERSION}.
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

    const sdkPackage =
      views.length > 0 || (await getLocalPackageVersion('@sanity/sdk-react', workDir))
        ? '@sanity/sdk-react'
        : '@sanity/sdk'
    const listOnly = dry || !isInteractive()

    if (!(await getLocalPackageVersion(sdkPackage, workDir))) {
      const install = `${sdkPackage}@^${MIN_SDK_VERSION}`

      if (listOnly || !(await confirm({default: true, message: `Install ${install} now?`}))) {
        output.log(`Install ${install} before you run \`sanity dev\`.`)
      } else {
        const {chosen} = await getPackageManagerChoice(workDir, {interactive: false})
        await installNewPackages({packageManager: chosen, packages: [install]}, {output, workDir})
      }
    }

    await upgradeRequiredPackages(
      [{min: MIN_SDK_VERSION, name: sdkPackage, neededBy: 'the migrated files need'}],
      {dry: listOnly, output, workDir},
    )

    return {options: {sdkPackage}, paths}
  },
  purpose,
}
