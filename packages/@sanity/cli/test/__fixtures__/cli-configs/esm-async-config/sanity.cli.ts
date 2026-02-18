import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

import {defineCliConfig} from 'sanity/cli'

// Top-level await: read config values from a JSON file at module load
const configPath = fileURLToPath(new URL('data.json', import.meta.url))
// eslint-disable-next-line unicorn/text-encoding-identifier-case
const raw = await readFile(configPath, 'utf-8')
const {dataset, projectId} = JSON.parse(raw) as {dataset: string; projectId: string}

export default defineCliConfig({
  api: {
    dataset,
    projectId,
  },
})
