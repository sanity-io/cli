import {styleText} from 'node:util'

import {type Hook} from '@oclif/core'
import {warn} from '@oclif/core/ux'
import {debug, findProjectRoot, type ProjectRootResult} from '@sanity/cli-core'
import {getSanityEnv} from '@sanity/cli-core/util'
import {loadEnv} from 'vite'

import {usesLocalCliConfig} from '../../util/blueprintCliContext.js'

export const injectEnvVariables: Hook.Prerun = async function ({argv, Command}) {
  if (!usesLocalCliConfig(Command?.id, argv)) return

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

  debug('Loading environment files using %s mode', mode)

  // Empty prefix loads all variables from .env files, not just SANITY_STUDIO_/SANITY_APP_ prefixed ones.
  // Client bundle exposure is separately controlled by Vite's envPrefix in getViteConfig.ts.
  const studioEnv = loadEnv(mode, workDir.directory, '')
  delete studioEnv.SANITY_CLI_MODE
  delete studioEnv.SANITY_BLUEPRINT_PROFILE
  delete studioEnv.SANITY_BLUEPRINT_EXPLICIT_TARGETS
  Object.assign(process.env, studioEnv)
}
