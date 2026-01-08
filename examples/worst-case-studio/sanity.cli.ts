import {defineCliConfig} from 'sanity/cli'
import tsconfigPaths from 'vite-tsconfig-paths'

// eslint-disable-next-line import/no-unresolved
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
