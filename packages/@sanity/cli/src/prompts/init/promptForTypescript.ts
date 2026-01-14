import {confirm} from '@sanity/cli-core/ux'

export function promptForTypeScript(): Promise<boolean> {
  return confirm({
    default: true,
    message: 'Do you want to use TypeScript?',
  })
}
