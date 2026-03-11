import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: {
    entry: './src/App.tsx',
    organizationId: 'org-id',
    // @ts-expect-error - resources is not yet in the published sanity package CliConfig types
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
