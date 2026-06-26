import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {schemaTypes} from './schemaTypes'

export default defineConfig({
  title: 'Federated Studio',

  dataset: 'test',
  projectId: 'ppsg7ml5',

  plugins: [structureTool()],

  schema: {
    types: schemaTypes,
  },
})
