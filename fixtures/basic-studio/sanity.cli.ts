import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    dataset: process.env.SANITY_E2E_DATASET || 'test',
    projectId: process.env.SANITY_E2E_PROJECT_ID || 'ppsg7ml5',
  },
  deployment: {
    autoUpdates: true,
  },
})
