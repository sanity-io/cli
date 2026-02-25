import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    dataset: 'production',
    projectId: 'abc123',
  },
  app: {
    entry: './src/App.tsx',
    icon: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>',
    organizationId: 'org-456',
    title: 'My Custom App',
  },
  deployment: {
    appId: 'my-studio-id',
    autoUpdates: true,
  },
  graphql: [
    {
      generation: 'gen3',
      id: 'default',
      playground: true,
      tag: 'default',
      workspace: 'default',
    },
  ],
  mediaLibrary: {
    aspectsPath: './aspects',
  },
  project: {
    basePath: '/studio',
  },
  reactCompiler: {target: '19'},
  reactStrictMode: true,
  server: {
    hostname: '0.0.0.0',
    port: 4000,
  },
  typegen: {overloadClientMethods: true},
})
