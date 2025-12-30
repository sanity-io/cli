import {Output} from '@sanity/cli-core'
import {confirm, select} from '@sanity/cli-core/ux'

export function promptForTypeScript(): Promise<boolean> {
  return confirm({
    default: true,
    message: 'Do you want to use TypeScript?',
  })
}

export function promptForDefaultConfig(): Promise<boolean> {
  return confirm({
    default: true,
    message: 'Use the default dataset configuration?',
  })
}

export function promptImplicitReconfigure(): Promise<boolean> {
  return confirm({
    default: true,
    message:
      'The current folder contains a configured Sanity studio. Would you like to reconfigure it?',
  })
}

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
