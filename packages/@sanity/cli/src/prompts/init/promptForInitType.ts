import {select} from '@sanity/cli-core/ux'

export function promptForInitType(): Promise<'app' | 'studio'> {
  return select({
    choices: [
      {
        description:
          'A customizable content editing workspace. Learn more: https://www.sanity.io/studio',
        name: 'Sanity Studio',
        value: 'studio',
      },
      {
        description:
          'Build a custom content app with React. Learn more: https://www.sanity.io/app-sdk',
        name: 'App SDK',
        value: 'app',
      },
    ],
    default: 'studio',
    message: 'What would you like to create?',
  })
}
