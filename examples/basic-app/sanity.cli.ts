import {defineCliConfig} from '@sanity/cli'

export default defineCliConfig({
  app: {
    entry: './src/App.tsx',
    organizationId: 'organizationId',
  },
})
