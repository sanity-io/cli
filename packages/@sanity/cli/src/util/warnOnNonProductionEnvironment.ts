import {styleText} from 'node:util'

import {warn} from '@oclif/core/ux'
import {getSanityEnv} from '@sanity/cli-core/util'

const knownEnvs = new Set(['development', 'production', 'staging'])

export function warnOnNonProductionEnvironment(): void {
  const sanityEnv = getSanityEnv()
  if (sanityEnv === 'production') {
    return
  }

  if (process.env.TEST !== 'true') {
    warn(
      styleText(
        'yellow',
        knownEnvs.has(sanityEnv)
          ? `Running in ${sanityEnv} environment mode\n`
          : `Running in ${styleText('red', 'UNKNOWN')} "${sanityEnv}" environment mode\n`,
      ),
    )
  }
}
