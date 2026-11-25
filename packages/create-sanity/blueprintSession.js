import {
  getHostCliUserConfigPath,
  readHostCliUserConfig,
  writeHostCliUserConfig,
} from '@sanity/cli-setup/user-config'
import {createClient, isHttpError} from '@sanity/client'

const loginRequired =
  'No valid Sanity credentials found. Set SANITY_AUTH_TOKEN to a valid token, or unset it and rerun without `--yes` in an interactive terminal to sign in.'

export async function getBlueprintClient({token, unattended}, log) {
  const environment = process.env.SANITY_INTERNAL_ENV
  const staging = environment === 'staging'
  const apiHost = staging ? 'https://api.sanity.work' : environment
  const client = createClient({
    ...(apiHost && apiHost !== 'production' ? {apiHost} : {}),
    apiVersion: 'v2025-08-30',
    requestTagPrefix: 'sanity.cli',
    useCdn: false,
    useProjectHostname: false,
  })
  const configPath = getHostCliUserConfigPath(staging)
  const savedToken = token ? undefined : readHostCliUserConfig(configPath).authToken
  const current = token || (typeof savedToken === 'string' ? savedToken : undefined)
  const session = await validateSession(client, current)
  if (session) return session

  if (token || unattended) throw new Error(loginRequired)

  // eslint-disable-next-line eslint-js/no-restricted-syntax -- only load prompts and browser support when needed
  const {loginForBlueprint} = await import('./promptBlueprint.js')
  const nextToken = await loginForBlueprint(client, staging, log)
  const signedIn = await validateSession(client, nextToken)
  if (!signedIn) throw new Error(loginRequired)

  const {telemetryConsent: _, ...config} = readHostCliUserConfig(configPath)
  writeHostCliUserConfig(configPath, {...config, authToken: nextToken})
  return signedIn
}

async function validateSession(client, token) {
  if (!token) return

  const session = client.withConfig({token})
  try {
    await session.users.getById('me')
    return session
  } catch (error) {
    if (isHttpError(error) && (error.statusCode === 401 || error.statusCode === 403)) {
      return
    }
    throw error
  }
}
