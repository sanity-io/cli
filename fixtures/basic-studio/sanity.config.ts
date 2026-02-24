import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {schemaTypes} from './schemaTypes'

export default defineConfig({
  title: 'Basic Studio',

  dataset: 'test',
  projectId: 'ppsg7ml5',

  plugins: [structureTool(), visionTool()],

  schema: {
    types: schemaTypes,
  },
})
