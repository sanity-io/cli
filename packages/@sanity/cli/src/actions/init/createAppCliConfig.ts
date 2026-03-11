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
  dataset: string
  entry: string
  projectId: string

  organizationId?: string
}

export function createAppCliConfig(options: GenerateCliConfigOptions): string {
  return processTemplate({
    template: defaultAppTemplate,
    variables: options,
  })
}
