import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: {
    entry: './src/App.tsx',
    organizationId: 'org-id',
    resources: {
      default: {
        dataset: 'test',
        projectId: 'ppsg7ml5',
      },
    },
  },
  deployment: {
    appId: 'app-id',
    autoUpdates: true,
  },
})
