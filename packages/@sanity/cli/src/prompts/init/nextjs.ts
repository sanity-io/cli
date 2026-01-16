import {confirm, input, select} from '@sanity/cli-core/ux'

export function promptForEmbeddedStudio(): Promise<boolean> {
  return confirm({
    default: true,
    message: `Would you like an embedded Sanity Studio?`,
  })
}

export function promptForStudioPath(): Promise<string> {
  return input({
    default: '/studio',
    message: 'What route do you want to use for the Studio?',
    validate(input) {
      if (!input.startsWith('/')) {
        return 'Must start with /'
      }

      if (input.endsWith('/')) {
        return 'Must not end with /'
      }

      // a-Z, 0-9, -, _ and /
      if (!/^[a-zA-Z0-9-_\\/]+$/.test(input)) {
        return 'Must only contain a-Z, 0-9, -, _ and /'
      }

      return true
    },
  })
}

export function promptForNextTemplate(): Promise<'blog' | 'clean'> {
  return select({
    choices: [
      {
        name: 'Blog (schema)',
        value: 'blog',
      },
      {
        name: 'Clean project with no predefined schema types',
        value: 'clean',
      },
    ],
    default: 'blog',
    message: 'Select project template to use',
  })
}

export function promptForAppendEnv(envFilename: string): Promise<boolean> {
  return confirm({
    default: true,
    message: `Would you like to add the project ID and dataset to your ${envFilename} file?`,
  })
}

export function promptForConfigFiles() {
  return confirm({
    default: true,
    message:
      'Would you like to add configuration files for a Sanity project in this Next.js folder?',
  })
}
