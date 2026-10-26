import {getCliExecutionContext} from '../executionContext'

export function getSanityEnv() {
  const context = getCliExecutionContext()

  if (context) return context.sanityEnv ?? 'production'

  return process.env.SANITY_INTERNAL_ENV ?? 'production'
}
