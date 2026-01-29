import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: {
    entry: './src/App.tsx',
    organizationId: 'org-id',
  },
  deployment: {
    appId: 'app-id',
    autoUpdates: true,
  },
})
