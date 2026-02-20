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
  }
})
`

interface GenerateCliConfigOptions {
  autoUpdates: boolean
  dataset: string
  projectId: string
}

export function createCliConfig(options: GenerateCliConfigOptions): string {
  return processTemplate({
    includeBooleanTransform: true,
    template: defaultTemplate,
    variables: options,
  })
}
