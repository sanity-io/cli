import {defineCliConfig} from 'sanity/cli'

import {projectConfig} from '@/config'

export default defineCliConfig({
  api: projectConfig,
})
