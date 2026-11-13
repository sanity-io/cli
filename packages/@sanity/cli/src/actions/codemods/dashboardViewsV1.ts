import path from 'node:path'

import {getCliConfig, getLocalPackageVersion, isInteractive} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {isWorkbenchApp} from '@sanity/workbench-cli'

import {determineIsApp} from '../../util/determineIsApp.js'
import {installNewPackages} from '../../util/packageManager/installPackages.js'
import {getPackageManagerChoice} from '../../util/packageManager/packageManagerChoice.js'
import {type CodeMod} from './types.js'
import {upgradeRequiredPackages} from './upgradeRequiredPackages.js'

const MIN_SANITY_VERSION = '6.25.0'
const MIN_SDK_VERSION = '3.12.0'

const purpose = 'Migrate Dashboard views and web workers to plain default exports'
const description = `
Rewrites the view and web worker files declared in sanity.cli.ts (or .js) from
\`unstable_defineView\` and \`unstable_defineService\` to plain default exports. Views read their
data with \`usePanel\`, \`useTile\` and \`useAssetSource\` from \`sanity/dashboard\`, and a panel's
title and body become one component with a close button. Web workers receive \`{bus, worker}\`.

Installs or upgrades sanity (${MIN_SANITY_VERSION} or later) and, in SDK apps, @sanity/sdk-react
(${MIN_SDK_VERSION} or later). Installs @sanity/ui and @sanity/icons when a panel needs them.
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
    const paths = [...views, ...(config.app.webWorkers ?? [])].map(({src}) =>
      path.resolve(workDir, src),
    )
    if (paths.length === 0) {
      throw new Error('sanity.cli.ts declares no views or web workers to migrate.')
    }

    const isApp = determineIsApp(config)
    const listOnly = dry || !isInteractive()
    const needed = [
      ...(isApp ? [['@sanity/sdk-react', `@sanity/sdk-react@^${MIN_SDK_VERSION}`]] : []),
      ...(views.some((view) => view.surface === 'panel')
        ? [
            ['@sanity/ui', '@sanity/ui@^4'],
            ['@sanity/icons', '@sanity/icons'],
          ]
        : []),
    ]
    const installed = await Promise.all(
      needed.map(([name]) => getLocalPackageVersion(name, workDir)),
    )
    const missing = needed.filter((_, index) => !installed[index]).map(([, install]) => install)

    if (missing.length > 0) {
      const packages = missing.join(', ')

      if (listOnly || !(await confirm({default: true, message: `Install ${packages} now?`}))) {
        output.log(`Install ${packages} before you run \`sanity dev\`.`)
      } else {
        const {chosen} = await getPackageManagerChoice(workDir, {interactive: false})
        await installNewPackages({packageManager: chosen, packages: missing}, {output, workDir})
      }
    }

    const neededBy = 'the migrated views need'
    await upgradeRequiredPackages(
      [
        {min: MIN_SANITY_VERSION, name: 'sanity', neededBy},
        ...(isApp ? [{min: MIN_SDK_VERSION, name: '@sanity/sdk-react', neededBy}] : []),
      ],
      {dry: listOnly, output, workDir},
    )

    return {options: {}, paths}
  },
  purpose,
}
