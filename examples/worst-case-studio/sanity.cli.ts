import {defines} from '@/defines'
import {defineCliConfig} from '@sanity/cli'
import tsconfigPaths from 'vite-tsconfig-paths'

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
