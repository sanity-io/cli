import {fileURLToPath} from 'node:url'

import {preparePackageShrinkwrap} from '../../../scripts/npm-shrinkwrap.mjs'

await preparePackageShrinkwrap(fileURLToPath(new URL('../', import.meta.url)), [
  '@sanity/cli-setup',
])
