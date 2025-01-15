import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {MyLogo} from './components/MyLogo.js'
import {schema} from './schema.js'

export default defineConfig({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'missingenv',
  apiHost: 'https://api.sanity.work',
  dataset: process.env.SANITY_STUDIO_DATASET || 'missingenv',
  plugins: [structureTool()],
  logo: MyLogo,
  schema,
})
