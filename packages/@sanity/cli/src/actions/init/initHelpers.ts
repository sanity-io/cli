import {type Output} from '@sanity/cli-core'

import {getSanityEnv} from '../../util/getSanityEnv.js'
import {type EditorName} from '../mcp/editorConfigs.js'
import {createOrAppendEnvVars} from './env/createOrAppendEnvVars.js'
import {fetchPostInitPrompt} from './fetchPostInitPrompt.js'

/**
 * Returns `true` when the user should be prompted for a flag value:
 * i.e. we are NOT in unattended mode AND the flag was not explicitly provided.
 */
export function shouldPrompt(unattended: boolean, flagValue: unknown): boolean {
  return !unattended && flagValue === undefined
}

/**
 * Returns the flag value if it is a boolean, otherwise returns the default.
 */
export function flagOrDefault(flagValue: boolean | undefined, defaultValue: boolean): boolean {
  return typeof flagValue === 'boolean' ? flagValue : defaultValue
}

export async function getPostInitMCPPrompt(editorsNames: EditorName[]): Promise<string> {
  return fetchPostInitPrompt(new Intl.ListFormat('en').format(editorsNames))
}

/**
 * When running in a non-production Sanity environment (e.g. staging), write the
 * `SANITY_INTERNAL_ENV` variable to a `.env` file in the output directory so that
 * the bootstrapped project continues to target the same environment.
 */
export async function writeStagingEnvIfNeeded(output: Output, outputPath: string): Promise<void> {
  const sanityEnv = getSanityEnv()
  if (sanityEnv === 'production') return

  await createOrAppendEnvVars({
    envVars: {INTERNAL_ENV: sanityEnv},
    filename: '.env',
    framework: null,
    log: false,
    output,
    outputPath,
  })
}
