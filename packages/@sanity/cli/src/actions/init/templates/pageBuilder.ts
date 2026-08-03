import {type ProjectTemplate} from '../types.js'

const configTemplate = `
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: '%sourceName%',
  title: '%projectName%',

  projectId: '%projectId%',
  dataset: '%dataset%',

  plugins: [
    structureTool(),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
  },
})
`

const pageBuilderTemplate: ProjectTemplate = {
  configTemplate,
  dependencies: {
    '@sanity/presets': '^1.0.0',
  },
}

export default pageBuilderTemplate
