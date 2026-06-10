import {processTemplate} from './processTemplate.js'

const defaultTemplate = `
import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: '%projectId%',
    dataset: '%dataset%'
  },
  deployment: {
    /**
     * Enable auto-updates for studios.
     * Learn more at https://www.sanity.io/docs/studio/latest-version-of-sanity#k47faf43faf56
     */
    autoUpdates: __BOOL__autoUpdates__,
  },
})
`

// The branded `unstable_defineApp` result is the sole workbench (module
// federation) opt-in. Studios brand with name/title only — no `entry`
// (studio app views aren't implemented yet).
const workbenchTemplate = `
import {defineCliConfig, unstable_defineApp} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: '%projectId%',
    dataset: '%dataset%'
  },
  app: unstable_defineApp({
    name: '%name%',
    title: '%title%',
  }),
  deployment: {
    /**
     * Enable auto-updates for studios.
     * Learn more at https://www.sanity.io/docs/studio/latest-version-of-sanity#k47faf43faf56
     */
    autoUpdates: __BOOL__autoUpdates__,
  },
})
`

interface GenerateCliConfigOptions {
  autoUpdates: boolean
  dataset: string
  name: string
  projectId: string
  title: string
  workbench: boolean
}

export function createCliConfig(options: GenerateCliConfigOptions): string {
  const {workbench, ...variables} = options
  return processTemplate({
    includeBooleanTransform: true,
    template: workbench ? workbenchTemplate : defaultTemplate,
    variables,
  })
}
