import {defineApplication, defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    dataset: 'test',
    projectId: 'ppsg7ml5',
  },
  // Calling `defineApplication` opts this studio into workbench (a
  // `sanity.config.ts` is present, so it resolves to `applicationType: 'studio'`).
  app: defineApplication({
    organizationId: 'oSyH1iET5',
    slug: 'federated-studio',
    title: 'Federated Studio',
  }),
  deployment: {
    autoUpdates: true,
  },
})
