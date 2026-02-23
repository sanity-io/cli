import {defineCliConfig} from 'sanity/cli'

// Uses deprecated top-level fields: studioHost and autoUpdates
export default defineCliConfig({
  api: {
    dataset: 'production',
    projectId: 'dep123',
  },
  autoUpdates: true,
  studioHost: 'my-studio',
})
