import {getGlobalCliClient} from '../../core/apiClient.js'
import {setConfig} from '../../core/cliConfig.js'
import {getCliToken} from '../../core/cliToken.js'
import {isHttpError} from '../../util/isHttpError.js'

const LOGOUT_API_VERSION = '2024-02-01'

export async function logout(): Promise<boolean> {
  const token = await getCliToken()
  if (!token) {
    return false
  }

  const client = await getGlobalCliClient({apiVersion: LOGOUT_API_VERSION})
  try {
    await client.request({method: 'POST', uri: '/auth/logout'})
  } catch (err: unknown) {
    // In the case of session timeouts or missing sessions, we'll get a 401
    // This is an acceptable situation seen from a logout perspective - all we
    // need to do in this case is clear the session from the view of the CLI
    if (isHttpError(err) && err.response.statusCode === 401) {
      return true
    }

    throw new Error(`Failed to logout: ${err}`, {cause: err})
  }

  setConfig('authToken', undefined)
  setConfig('telemetryConsent', undefined)

  return true
}
