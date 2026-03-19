import {processTemplate} from './processTemplate.js'

const appTemplateWithResources = `
import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: {
    organizationId: '%organizationId%',
    entry: '%entry%',
    resources: {
      default: {
        projectId: '%projectId%',
        dataset: '%dataset%',
      }
    }
  },
})
`

const appTemplateWithoutResources = `
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

  dataset?: string
  organizationId?: string
  projectId?: string
}

function hasResources(options: GenerateCliConfigOptions): boolean {
  return Boolean(options.projectId && options.dataset)
}

export function createAppCliConfig(options: GenerateCliConfigOptions): string {
  const template = hasResources(options) ? appTemplateWithResources : appTemplateWithoutResources

  return processTemplate({
    template,
    variables: options,
  })
}
