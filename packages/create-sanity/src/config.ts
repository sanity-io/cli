import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname, join} from 'node:path'

/** The `sanity` CLI user config file, shared so logins carry over between the two */
export function configPath(): string {
  if (process.env.SANITY_CLI_CONFIG_PATH) return process.env.SANITY_CLI_CONFIG_PATH
  const suffix = process.env.SANITY_INTERNAL_ENV === 'staging' ? '-staging' : ''
  return join(homedir(), '.config', `sanity${suffix}`, 'config.json')
}

export function readConfig(): Record<string, unknown> {
  try {
    const config: unknown = JSON.parse(readFileSync(configPath(), 'utf8'))
    return config && typeof config === 'object' && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function writeConfig(config: Record<string, unknown>): void {
  const path = configPath()
  mkdirSync(dirname(path), {recursive: true})
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, {mode: 0o600})
}

/** Where the active token comes from: the environment wins over the stored login */
export function getToken(): string | undefined {
  const envToken = process.env.SANITY_AUTH_TOKEN?.trim()
  if (envToken) return envToken
  const {authToken} = readConfig()
  return typeof authToken === 'string' ? authToken : undefined
}

/** Store a new login token. Telemetry consent is tied to the user, so it is reset. */
export function storeToken(token: string): void {
  const {telemetryConsent: _consent, ...config} = readConfig()
  writeConfig({...config, authToken: token})
}
