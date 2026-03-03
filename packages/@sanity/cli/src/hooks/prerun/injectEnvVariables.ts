import {styleText} from 'node:util'

import {type Hook} from '@oclif/core'
import {warn} from '@oclif/core/ux'
import {debug, findProjectRoot, type ProjectRootResult} from '@sanity/cli-core'
import {loadEnv} from 'vite'

import {getSanityEnv} from '../../util/getSanityEnv.js'

export const injectEnvVariables: Hook.Prerun = async function ({Command}) {
  let workDir: ProjectRootResult | undefined
  try {
    workDir = await findProjectRoot(process.cwd())
  } catch {
    // Accept not finding a project root
  }

  if (!workDir) {
    return
  }

  // Use `production` for `sanity build` / `sanity deploy`,
  // but default to `development` for everything else unless `SANITY_ACTIVE_ENV` is set
  const isProdCmd = ['build', 'deploy'].includes(Command.id)
  let mode = process.env.SANITY_ACTIVE_ENV
  if (!mode && (isProdCmd || process.env.NODE_ENV === 'production')) {
    mode = 'production'
  } else if (!mode) {
    mode = 'development'
  }

  if (mode === 'production' && !isProdCmd) {
    warn(styleText('yellow', `Running in ${getSanityEnv()} environment mode\n`))
  }

  const isApp = workDir.type === 'app'
  debug('Loading environment files using %s mode', mode)

  const studioEnv = loadEnv(mode, workDir.directory, [isApp ? 'SANITY_APP_' : 'SANITY_STUDIO_'])
  Object.assign(process.env, studioEnv)
}
