import {defineCliConfig} from 'sanity/cli'

import {baseConfig} from './base'
import {serverDefaults} from './shared'

// Spread base config and override with local imports
export default defineCliConfig({
  ...baseConfig,
  server: {
    ...serverDefaults,
    port: 4444,
  },
})
