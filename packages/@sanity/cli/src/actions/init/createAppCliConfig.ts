import {processTemplate} from './processTemplate.js'

const defaultAppTemplate = `
import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: {
    organizationId: '%organizationId%',
    entry: '%entry%',
    resources: {
      default: {
        projectId: '%projectId%',
        dataset: '%dataset%',
      },
    },
  },
})
`

interface GenerateCliConfigOptions {
  entry: string

  dataset?: string

  organizationId?: string
  projectId?: string
}

export function createAppCliConfig(options: GenerateCliConfigOptions): string {
  return processTemplate({
    template: defaultAppTemplate,
    variables: options,
  })
}
