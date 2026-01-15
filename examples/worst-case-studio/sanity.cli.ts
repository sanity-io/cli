import {defineCliConfig} from 'sanity/cli'
import tsconfigPaths from 'vite-tsconfig-paths'

import {defines} from '@/defines'

export default defineCliConfig({
  api: {
    dataset: 'test',
    projectId: 'ppsg7ml5',
  },
  vite: {
    define: defines,
    plugins: [tsconfigPaths({root: '.'})],
  },
})
