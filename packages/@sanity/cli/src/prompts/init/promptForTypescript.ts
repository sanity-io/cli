import {confirm} from '@sanity/cli-core/ux'

export function promptForTypeScript(): Promise<boolean> {
  return confirm({
    default: true,
    message: 'Do you want to use TypeScript?',
  })
}

export function promptImplicitReconfigure(): Promise<boolean> {
  return confirm({
    default: true,
    message:
      'The current folder contains a configured Sanity studio. Would you like to reconfigure it?',
  })
}
