import {type CliConfig} from 'sanity/cli'

export const baseConfig: CliConfig = {
  api: {
    dataset: 'production',
    projectId: 'rel123',
  },
  deployment: {
    autoUpdates: true,
  },
}
