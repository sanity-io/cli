import {getSanityEnv} from '../../util/getSanityEnv.js'
import {type EditorName} from '../mcp/editorConfigs.js'
import {createOrAppendEnvVars} from './env/createOrAppendEnvVars.js'
import {fetchPostInitPrompt} from './fetchPostInitPrompt.js'
import {type InitContext} from './types.js'

export function shouldPrompt(unattended: boolean, flagValue: unknown): boolean {
  return !unattended && flagValue === undefined
}

export function flagOrDefault(flagValue: boolean | undefined, defaultValue: boolean): boolean {
  return typeof flagValue === 'boolean' ? flagValue : defaultValue
}

export async function getPostInitMCPPrompt(editorsNames: EditorName[]): Promise<string> {
  return fetchPostInitPrompt(new Intl.ListFormat('en').format(editorsNames))
}

export async function writeStagingEnvIfNeeded(
  output: InitContext['output'],
  outputPath: string,
): Promise<void> {
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
