import os from 'node:os'
import path from 'node:path'

export function getGlobalConfigLocation(): string {
  const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  const sanityEnvSuffix = process.env.SANITY_INTERNAL_ENV === 'staging' ? '-staging' : ''
  return path.join(configDir, `sanity${sanityEnvSuffix}`, 'config.json')
}
