import {mkdir, writeFile} from 'node:fs/promises'

import cliManifest from '@sanity/cli/package.json' with {type: 'json'}

await mkdir(new URL('../dist/', import.meta.url), {recursive: true})
await writeFile(
  new URL('../dist/studio-cli-version.json', import.meta.url),
  JSON.stringify({version: cliManifest.version}),
)
