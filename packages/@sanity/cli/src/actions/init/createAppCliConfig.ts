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

export interface GenerateCliConfigOptions {
  entry: string

  organizationId?: string
}

export function createAppCliConfig(options: GenerateCliConfigOptions): string {
  return processTemplate({
    template: defaultAppTemplate,
    variables: options,
  })
}
