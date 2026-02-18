import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {defineCliConfig} from 'sanity/cli'

// Both ESM path resolution techniques
const configDir = new URL('.', import.meta.url).pathname
const __filename = fileURLToPath(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __dirname = path.dirname(__filename)

export default defineCliConfig({
  api: {
    dataset: 'production',
    projectId: 'imu123',
  },
  mediaLibrary: {
    aspectsPath: `${configDir}aspects`,
  },
  server: {
    hostname: 'localhost',
    port: 7777,
  },
})
