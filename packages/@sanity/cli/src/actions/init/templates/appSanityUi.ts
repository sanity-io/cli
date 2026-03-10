import {type ProjectTemplate} from '../types.js'

const appSanityUiTemplate: ProjectTemplate = {
  dependencies: {
    '@sanity/ui': '^3',
    'styled-components': '^6.1.18',
  },
  entry: './src/App.tsx',
  type: 'module',
}

export default appSanityUiTemplate
