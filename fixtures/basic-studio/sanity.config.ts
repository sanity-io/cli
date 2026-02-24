import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {media} from 'sanity-plugin-media'
import {structureTool} from 'sanity/structure'

import {schemaTypes} from './schemaTypes'

export default defineConfig({
  title: 'Basic Studio',

  dataset: 'test',
  projectId: 'ppsg7ml5',

  plugins: [structureTool(), visionTool(), media()],

  schema: {
    types: schemaTypes,
  },
})
