import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    dataset: 'test',
    projectId: 'ppsg7ml5',
  },
  deployment: {
    autoUpdates: true,
  },
})
