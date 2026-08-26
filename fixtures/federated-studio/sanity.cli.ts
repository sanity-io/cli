import {defineCliConfig, unstable_defineApp} from 'sanity/cli'

export default defineCliConfig({
  api: {
    dataset: 'test',
    projectId: 'ppsg7ml5',
  },
  // Calling `unstable_defineApp` opts this studio into workbench (a
  // `sanity.config.ts` is present, so it resolves to `applicationType: 'studio'`).
  app: unstable_defineApp({
    organizationId: 'oSyH1iET5',
    slug: 'federated-studio',
    title: 'Federated Studio',
  }),
  deployment: {
    autoUpdates: true,
  },
})
