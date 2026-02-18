import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    dataset: 'production',
    projectId: 'gql123',
  },
  graphql: [
    {
      generation: 'gen3',
      id: 'default',
      nonNullDocumentFields: true,
      playground: true,
      tag: 'default',
      workspace: 'default',
    },
    {
      filterSuffix: 'staging',
      generation: 'gen2',
      id: 'staging',
      playground: false,
      source: 'staging',
      tag: 'staging',
      workspace: 'staging',
    },
  ],
})
