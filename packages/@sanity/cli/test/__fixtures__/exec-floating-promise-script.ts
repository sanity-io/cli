// Test script for `sanity exec` command
// Tests that a script driven by a floating promise (rather than top-level await) can still use
// dynamic `import()` after its top-level evaluation has finished

async function main(): Promise<void> {
  // Yield to the event loop so that top-level evaluation of this module completes first
  await new Promise((resolve) => setTimeout(resolve, 10))

  // eslint-disable-next-line no-restricted-syntax -- the dynamic import is what this fixture exercises
  const {getCliClient} = await import('sanity/cli')

  // Output JSON that tests can parse
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      hasGetCliClient: typeof getCliClient === 'function',
      success: true,
    }),
  )
}

// eslint-disable-next-line unicorn/prefer-top-level-await -- the floating promise is what this fixture exercises
main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exit(1)
})
