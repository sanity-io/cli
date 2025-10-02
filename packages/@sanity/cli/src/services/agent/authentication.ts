import {getGlobalCliClient} from '@sanity/cli-core'
import debug from 'debug'

import {API_VERSION, HARDCODED_ORG_ID, HARDCODED_RESOURCES} from './constants.js'
import {logErrorToFile, logToFile} from './fileLogger.js'

const log = debug('sanity:agent:auth')

/**
 * Response from the agent handshake endpoint
 */
interface HandshakeResponse {
  token: string
}

/**
 * Get a WebSocket authentication token from the agent handshake endpoint
 *
 * @returns Promise that resolves to the WebSocket token
 * @throws Error if handshake fails or user is not authenticated
 */
export async function getAgentWebSocketToken(): Promise<string> {
  log('Requesting WebSocket token from handshake endpoint')
  await logToFile('Requesting WebSocket token from handshake endpoint', 'info')

  try {
    // Get authenticated client with user's CLI token
    const client = await getGlobalCliClient({
      apiVersion: API_VERSION,
      requireUser: true,
    })

    log(
      'Calling handshake endpoint with org: %s, resources: %o',
      HARDCODED_ORG_ID,
      HARDCODED_RESOURCES,
    )
    await logToFile(
      `Calling handshake endpoint with org: ${HARDCODED_ORG_ID}, resources: ${JSON.stringify(HARDCODED_RESOURCES)}`,
      'debug',
    )

    // Call handshake endpoint
    const response = await client.request<HandshakeResponse>({
      body: {
        organizationId: HARDCODED_ORG_ID,
        resources: HARDCODED_RESOURCES,
      },
      method: 'POST',
      uri: `agent/handshake`,
    })

    log('Handshake successful, received token')
    await logToFile('Handshake successful, received token', 'info')
    return response.token
  } catch (error) {
    log('Handshake failed: %o', error)
    await logErrorToFile(
      error instanceof Error ? error : new Error(String(error)),
      'Handshake failed',
    )
    throw new Error(
      `Failed to get agent WebSocket token: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}
