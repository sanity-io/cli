import {getCliExecutionContext} from '@sanity/cli-core/executionContext'

export function getSanityEnv() {
  const context = getCliExecutionContext()

  if (context) return context.sanityEnv ?? 'production'

  return process.env.SANITY_INTERNAL_ENV ?? 'production'
}
