import {type CurrentUser} from '@sanity/sdk'
import {type View, type ViewApplication} from '@sanity/sdk/dashboard'

interface ApplicationsContext {
  applications: readonly (ViewApplication & {
    views: readonly View<{includeApplication: false}>[]
  })[]
  currentUser: CurrentUser
}

interface DefineDashboardConfigInput {
  applications?: {
    hidden?: (
      references: readonly ViewApplication['reference'][],
      context: ApplicationsContext,
    ) => readonly ViewApplication['reference'][]
    visible?: (
      references: readonly ViewApplication['reference'][],
      context: ApplicationsContext,
    ) => readonly ViewApplication['reference'][]
  }
  views?: (views: readonly View[], context: {currentUser: CurrentUser}) => readonly View[]
}

export function defineDashboardConfig(
  config: DefineDashboardConfigInput,
): DefineDashboardConfigInput {
  return config
}
