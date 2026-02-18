import {defineCliConfig} from 'sanity/cli'

// Vite plugins are non-serializable (functions/objects with methods)
// This forces fallback from worker thread to main thread loading
export default defineCliConfig({
  api: {
    dataset: 'production',
    projectId: 'vp123',
  },
  vite: {
    plugins: [
      {
        name: 'custom-plugin',
        transform(code: string) {
          return code
        },
      },
    ],
  },
})
