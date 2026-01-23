import {processTemplate} from './processTemplate.js'

const defaultTemplate = `
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: '%sourceName%',
  title: '%projectName%',

  projectId: '%projectId%',
  dataset: '%dataset%',

  plugins: [structureTool(), visionTool()],

  schema: {
    types: schemaTypes,
  },
})
`

const defaultVariables = {
  projectName: 'Sanity Studio',
  sourceName: 'default',
  sourceTitle: 'Default',
}

export interface GenerateConfigOptions {
  variables: {
    autoUpdates: boolean
    dataset: string
    organizationId?: string
    projectId: string
    projectName?: string
    sourceName?: string
    sourceTitle?: string
  }

  template?: ((variables: GenerateConfigOptions['variables']) => string) | string
}

export function createStudioConfig(options: GenerateConfigOptions): string {
  const variables = {...defaultVariables, ...options.variables}
  if (typeof options.template === 'function') {
    return options.template(variables).trimStart()
  }

  return processTemplate({
    template: options.template || defaultTemplate,
    variables,
  })
}
