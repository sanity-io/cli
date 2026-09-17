import {defineApplication, defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: defineApplication({
    entry: './App.tsx',
    organizationId: 'oSyH1iET5',
    slug: 'federated-app',
    title: 'Federated App',
  }),
  deployment: {autoUpdates: false},
})
