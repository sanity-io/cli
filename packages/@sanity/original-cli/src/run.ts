import path from 'node:path'

import {runCli} from './cli.js'
import {getCliVersion} from './util/getCliVersion.js'

getCliVersion().then((cliVersion) => {
  runCli(path.join(__dirname, '..'), {cliVersion})
})
