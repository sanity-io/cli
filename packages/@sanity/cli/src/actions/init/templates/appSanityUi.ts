import {type ProjectTemplate} from '../types.js'

const appSanityUiTemplate: ProjectTemplate = {
  dependencies: {
    '@sanity/ui': '^3.5.0',
    'styled-components': '^6.1.18',
  },
  entry: './src/App.tsx',
  type: 'module',
  typescriptOnly: true,
}

export default appSanityUiTemplate
