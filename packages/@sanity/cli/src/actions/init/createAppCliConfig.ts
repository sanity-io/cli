import {processTemplate} from './processTemplate.js'

const defaultAppTemplate = `
import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: {
    organizationId: '%organizationId%',
    entry: '%entry%',
  },
  federation: {
    enabled: __BOOL__federation__,
  },
})
`

interface GenerateCliConfigOptions {
  entry: string
  federation: boolean

  organizationId?: string
}

export function createAppCliConfig(options: GenerateCliConfigOptions): string {
  return processTemplate({
    includeBooleanTransform: true,
    template: defaultAppTemplate,
    variables: options,
  })
}
