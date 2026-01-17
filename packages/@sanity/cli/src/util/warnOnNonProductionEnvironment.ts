import {warn} from '@oclif/core/ux'
import {chalk} from '@sanity/cli-core/ux'

import {sanityEnv} from './sanityEnv.js'

const knownEnvs = new Set(['development', 'production', 'staging'])

export function warnOnNonProductionEnvironment(): void {
  if (sanityEnv() === 'production') {
    return
  }

  if (process.env.TEST !== 'true') {
    warn(
      chalk.yellow(
        knownEnvs.has(sanityEnv())
          ? `Running in ${sanityEnv()} environment mode\n`
          : `Running in ${chalk.red('UNKNOWN')} "${sanityEnv()}" environment mode\n`,
      ),
    )
  }
}
