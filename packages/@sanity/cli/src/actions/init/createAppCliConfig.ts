import {workbenchAppConfigTemplate} from '@sanity/workbench-cli/init'

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

interface GenerateCliConfigOptions {
  entry: string
  isWorkbenchApp: boolean
  name: string
  title: string

  organizationId?: string
}

export function createAppCliConfig(options: GenerateCliConfigOptions): string {
  const {isWorkbenchApp, ...variables} = options
  return processTemplate({
    includeBooleanTransform: true,
    template: isWorkbenchApp ? workbenchAppConfigTemplate : defaultAppTemplate,
    variables,
  })
}
