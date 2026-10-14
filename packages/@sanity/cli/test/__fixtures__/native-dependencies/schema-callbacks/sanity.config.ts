// eslint-disable-next-line no-restricted-imports -- This fixture models a Studio config.
import {defineConfig, definePlugin} from 'sanity'
import styledComponents from 'styled-components'

const Input = styledComponents.div({color: 'red'})
const fields = [{components: {input: Input}, name: 'title', type: 'string'}]

const child = definePlugin({
  name: 'child',
  schema: {types: [{fields, name: 'childDocument', type: 'document'}]},
})
const parent = definePlugin({
  name: 'parent',
  plugins: [child()],
  schema: {
    types: (previous, context) => {
      if (!previous.some((type) => type.name === 'childDocument')) {
        throw new Error('Missing child schema')
      }
      if (context.projectId !== 'testproj' || context.dataset !== 'production') {
        throw new Error('Invalid context')
      }
      return [...previous, {fields, name: 'parentDocument', type: 'document'}]
    },
  },
})

export default defineConfig({
  dataset: 'production',
  plugins: [parent()],
  projectId: 'testproj',
  schema: {
    types: (previous) => {
      if (!previous.some((type) => type.name === 'parentDocument')) {
        throw new Error('Missing parent schema')
      }
      return [...previous, {fields, name: 'rootDocument', type: 'document'}]
    },
  },
})
