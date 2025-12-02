// Test script for `sanity exec` command
// Tests that we can import and use getCliClient

import {getCliClient} from '@sanity/cli'

try {
  const client = getCliClient()

  // Try to fetch current user info
  const user = await client
    .withConfig({apiVersion: '2025-12-01'})
    .users.getById('me')
    .catch(() => ({email: 'unknown', id: 'unknown'}))

  // Output JSON that tests can parse
  console.log(
    JSON.stringify({
      browser: {
        intersectionObserver: !!globalThis?.window?.IntersectionObserver,
      },
      env: {
        NODE_ENV: process.env.NODE_ENV,
        SANITY_BASE_PATH: process.env.SANITY_BASE_PATH,
      },
      success: true,
      user: {
        email: user.email,
        id: user.id,
      },
    }),
  )
} catch (error) {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      success: false,
    }),
  )
  process.exit(1)
}
