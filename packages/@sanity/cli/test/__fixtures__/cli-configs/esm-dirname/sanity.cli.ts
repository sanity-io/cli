import path from 'node:path'

import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    dataset: 'production',
    projectId: 'dirname123',
  },
  mediaLibrary: {
    aspectsPath: path.resolve(__dirname, 'aspects'),
  },
})
