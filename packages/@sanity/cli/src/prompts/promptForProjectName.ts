import {input} from '@sanity/cli-core/ux'

import {validateProjectName} from '../actions/projects/validateProjectName'

export async function promptForProjectName(): Promise<string> {
  return input({
    default: 'My Sanity Project',
    message: 'Project name:',
    validate: validateProjectName,
  })
}
