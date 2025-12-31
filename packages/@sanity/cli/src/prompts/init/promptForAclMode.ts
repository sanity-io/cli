import {Output} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'

export async function promptForAclMode(output: Output): Promise<string> {
  const mode = await select({
    choices: [
      {
        name: 'Public (world readable)',
        value: 'public',
      },
      {
        name: 'Private (authenticated requests only)',
        value: 'private',
      },
    ],
    message: 'Choose dataset visibility – this can be changed later',
  })

  if (mode === 'private') {
    output.log(
      'Please note that while documents are private, assets (files and images) are still public\n',
    )
  }

  return mode
}
