import {defineCliConfig} from 'sanity/cli'

// Vite config as async function — non-serializable, forces main thread loading
export default defineCliConfig({
  api: {
    dataset: 'production',
    projectId: 'vf123',
  },
  vite: async (config, env) => {
    return {
      ...config,
      define: {
        __MODE__: JSON.stringify(env.mode),
      },
    }
  },
})
