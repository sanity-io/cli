import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    dataset: 'production',
    projectId: 'ppsg7ml5',
  },
  graphql: [
    {
      id: 'production-api',
      tag: 'default',
      workspace: 'production',
    },
    {
      id: 'staging-api',
      tag: 'staging',
      workspace: 'staging',
    },
  ],
})
