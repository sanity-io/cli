import {subdebug} from '@sanity/cli-core'
import {select, Separator, spinner} from '@sanity/cli-core/ux'
import {groupBy} from 'lodash-es'

import {getMediaLibraries} from '../services/mediaLibraries.js'

const debug = subdebug('media:determine-target-library')

/**
 * Fetch a list of available media libraries and present them to the user in a list prompt. The items
 * in the list prompt are grouped by organization id.
 */
export async function selectMediaLibrary(projectId: string): Promise<string> {
  debug('Fetching available media libraries')
  const spin = spinner('Fetching available media libraries').start()

  try {
    const activeLibraries = await getMediaLibraries(projectId)

    const byOrg = groupBy(activeLibraries, 'organizationId')

    spin.succeed()

    // Create flat choices array with separators
    const choices: Array<Separator | {name: string; value: string}> = []
    for (const [orgId, libs] of Object.entries(byOrg)) {
      choices.push(
        new Separator(`Organization: ${orgId}`),
        ...libs.map((lib) => ({name: lib.id, value: lib.id})),
      )
    }

    return select({
      choices,
      message: 'Select media library',
    })
  } catch (error) {
    spin.fail('Failed to fetch media libraries')
    throw error
  }
}
