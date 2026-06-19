import {unstable_defineApp} from '@sanity/federation'
import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    dataset: 'test',
    projectId: 'ppsg7ml5',
  },
  // Calling `unstable_defineApp` opts this studio into workbench (a
  // `sanity.config.ts` is present, so it resolves to `applicationType: 'studio'`).
  app: unstable_defineApp({
    name: 'federated-studio',
    organizationId: 'oSyH1iET5',
  }),
  deployment: {
    autoUpdates: true,
  },
})
