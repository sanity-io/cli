/**
 * Constants for agent API integration
 */

// API configuration
export const API_VERSION = 'vX'

// TODO: Replace these with actual values when ready for testing
// These are hardcoded during beta phase
export const HARDCODED_ORG_ID = 'oSyH1iET5'
export const HARDCODED_RESOURCES = [
  {
    dataset: 'production',
    id: 'r2um9mn5z5ottqqegsmm9tq6-default',
    name: 'default',
    projectId: 'v28v5k8m',
    title: 'sdk-examples-movies',
    type: 'studio',
  },
]

/**
 * Get the WebSocket host based on environment
 */
function getWsHost(): string {
  const sanityEnv = process.env.SANITY_INTERNAL_ENV || 'production'

  if (sanityEnv === 'staging') {
    return 'wss://api.sanity.work'
  }

  return 'wss://api.sanity.io'
}

export const WS_HOST = getWsHost()

// WebSocket configuration
export const RECONNECT_DELAY_MS = 3000
export const MAX_RECONNECT_ATTEMPTS = 10
export const HEARTBEAT_INTERVAL_MS = 30_000 // 30 seconds
export const HEARTBEAT_TIMEOUT_MS = 90_000 // 90 seconds
