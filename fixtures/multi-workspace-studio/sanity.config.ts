import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {schemaTypes} from './schemaTypes'

export default defineConfig([
  {
    basePath: '/prod',
    name: 'production',
    title: 'Production',

    dataset: 'test',
    projectId: 'ppsg7ml5',

    plugins: [structureTool(), visionTool()],

    schema: {
      types: schemaTypes,
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
      types: schemaTypes,
    },
  },
])
