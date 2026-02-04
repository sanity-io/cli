import {styleText} from 'node:util'

import {warn} from '@oclif/core/ux'

import {getSanityEnv} from './getSanityEnv.js'

const knownEnvs = new Set(['development', 'production', 'staging'])

export function warnOnNonProductionEnvironment(): void {
  if (getSanityEnv() === 'production') {
    return
  }

  if (process.env.TEST !== 'true') {
    warn(
      styleText(
        'yellow',
        knownEnvs.has(getSanityEnv())
          ? `Running in ${getSanityEnv()} environment mode\n`
          : `Running in ${styleText('red', 'UNKNOWN')} "${getSanityEnv()}" environment mode\n`,
      ),
    )
  }
}
