import {type Application, type CurrentUser} from '@sanity/sdk'
import {type View} from '@sanity/sdk/dashboard'

interface ApplicationsContext {
  applications: readonly (Application & {views: readonly View[]})[]
  currentUser: CurrentUser
}

interface DefineDashboardConfigInput {
  applications?: {
    hidden?: (
      references: readonly Application['reference'][],
      context: ApplicationsContext,
    ) => readonly Application['reference'][]
    visible?: (
      references: readonly Application['reference'][],
      context: ApplicationsContext,
    ) => readonly Application['reference'][]
  }
  views?: (views: readonly View[], context: {currentUser: CurrentUser}) => readonly View[]
}

export function defineDashboardConfig(
  config: DefineDashboardConfigInput,
): DefineDashboardConfigInput {
  return config
}
