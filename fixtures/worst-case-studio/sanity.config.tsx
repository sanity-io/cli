import DescriptionInput from '@/descriptionInput'
import {schemaTypes} from '@/schemaTypes'
import {codeInput} from '@sanity/code-input'
import {visionTool} from '@sanity/vision'
// eslint-disable-next-line import/no-unresolved
import {theme} from 'https://themer.sanity.build/api/hues?preset=dew'
import {defineConfig, defineField, defineType} from 'sanity'
import {structureTool} from 'sanity/structure'

// Look ma, dynamic imports in the config 🙈
// Look ma, top level await in the config 🙈
const arbitraryImport = await import('@/defines')

export default defineConfig({
  theme,
  title: arbitraryImport.studioTitle,

  dataset: 'test',

  // Don't do this in a real project.
  // @ts-expect-error - defined through vite's `define` option in CLI config
  projectId: PROJECT_ID,

  plugins: [structureTool(), visionTool(), codeInput()],

  schema: {
    types: [
      ...schemaTypes,

      defineType({
        fields: [
          defineField({name: 'title', type: 'string'}),
          defineField({components: {input: DescriptionInput}, name: 'description', type: 'text'}),
        ],
        name: 'wurst',
        type: 'document',

        preview: {
          prepare(values) {
            // Look ma, JSX in the config 🙈
            return {...values, media: <em>🌭</em>}
          },
          select: {title: 'title'},
        },
      }),
    ],
  },
})
