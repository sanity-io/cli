import {warn} from '@oclif/core/ux'
import {chalk} from '@sanity/cli-core/ux'

import {getSanityEnv} from './getSanityEnv.js'

const knownEnvs = new Set(['development', 'production', 'staging'])

export function warnOnNonProductionEnvironment(): void {
  if (getSanityEnv() === 'production') {
    return
  }

  if (process.env.TEST !== 'true') {
    warn(
      chalk.yellow(
        knownEnvs.has(getSanityEnv())
          ? `Running in ${getSanityEnv()} environment mode\n`
          : `Running in ${chalk.red('UNKNOWN')} "${getSanityEnv()}" environment mode\n`,
      ),
    )
  }
}
