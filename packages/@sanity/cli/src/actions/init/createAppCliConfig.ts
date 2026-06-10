import {processTemplate} from './processTemplate.js'

const defaultAppTemplate = `
import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: {
    organizationId: '%organizationId%',
    entry: '%entry%',
  },
})
`

// The branded `unstable_defineApp` result is the sole workbench (module
// federation) opt-in — `entry` auto-declares the navigable app view.
const workbenchAppTemplate = `
import {defineCliConfig, unstable_defineApp} from 'sanity/cli'

export default defineCliConfig({
  app: unstable_defineApp({
    name: '%name%',
    title: '%title%',
    organizationId: '%organizationId%',
    entry: '%entry%',
  }),
})
`

interface GenerateCliConfigOptions {
  entry: string
  name: string
  title: string
  workbench: boolean

  organizationId?: string
}

export function createAppCliConfig(options: GenerateCliConfigOptions): string {
  const {workbench, ...variables} = options
  return processTemplate({
    includeBooleanTransform: true,
    template: workbench ? workbenchAppTemplate : defaultAppTemplate,
    variables,
  })
}
