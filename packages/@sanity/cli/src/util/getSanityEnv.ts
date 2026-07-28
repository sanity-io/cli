import {getCliExecutionContext} from '@sanity/cli-core/executionContext'

export const getSanityEnv = () =>
  getCliExecutionContext()?.sanityEnv ?? process.env.SANITY_INTERNAL_ENV ?? 'production'
