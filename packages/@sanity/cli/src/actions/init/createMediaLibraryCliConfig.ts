import {workbenchMediaLibraryConfigTemplate} from '@sanity/workbench-cli/init'

import {processTemplate} from './processTemplate.js'

export function createMediaLibraryCliConfig(options: {organizationId?: string}): string {
  return processTemplate({
    template: workbenchMediaLibraryConfigTemplate,
    variables: {organizationId: options.organizationId ?? ''},
  })
}
