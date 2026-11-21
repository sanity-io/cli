import {workbenchMediaLibraryConfigTemplate} from '@sanity/cli-core/workbench'

import {processTemplate} from './processTemplate.js'

export function createMediaLibraryCliConfig(options: {organizationId?: string}): string {
  return processTemplate({
    template: workbenchMediaLibraryConfigTemplate,
    variables: {organizationId: options.organizationId ?? ''},
  })
}
