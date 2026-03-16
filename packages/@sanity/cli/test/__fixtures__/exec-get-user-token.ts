// Test script for `sanity exec --with-user-token`
// Verifies that the token is available in the client config

import {getCliClient} from 'sanity/cli'

try {
  const client = getCliClient()
  const config = client.config()

  // Output whether the token was received
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      hasToken: typeof config.token === 'string' && config.token.length > 0,
      success: true,
    }),
  )
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      success: false,
    }),
  )
  process.exit(1)
}
