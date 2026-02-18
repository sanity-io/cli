import {defineCliConfig} from 'sanity/cli'

// Side-effect import — the module sets a global when loaded
import './logger'

export default defineCliConfig({
  api: {
    dataset: 'production',
    projectId: 'se123',
  },
})
