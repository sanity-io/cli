/* eslint-disable n/no-extraneous-import */
import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    dataset: 'production',
    projectId: 'typescript123',
  },
})
