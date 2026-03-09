import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {productionSchemaTypes, stagingSchemaTypes} from './schemaTypes'

export default defineConfig([
  {
    basePath: '/production',
    name: 'production',
    title: 'Production',

    dataset: 'production',
    projectId: 'ppsg7ml5',

    plugins: [structureTool(), visionTool()],

    schema: {
      types: productionSchemaTypes,
    },
  },

  {
    basePath: '/staging',
    name: 'staging',
    title: 'Staging',

    dataset: 'staging',
    projectId: 'ppsg7ml5',

    plugins: [structureTool(), visionTool()],

    schema: {
      types: stagingSchemaTypes,
    },
  },
])
