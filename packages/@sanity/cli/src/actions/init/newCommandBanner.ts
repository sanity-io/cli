import {styleText} from 'node:util'

import {boxen} from '@sanity/cli-core/ux'

import {hyperlink as link} from '../../util/terminalLink.js'
import {type InitContext} from './types.js'

const SANITY_NEW_URL = 'https://sanity.new'

export function renderNewCommandBanner(output: InitContext['output']): void {
  output.log('')
  output.log(
    boxen(
      `${styleText('bold', 'Two ways to start')}

${styleText('cyan', 'sanity init')}  Log in and set up a Studio ${styleText('dim', "(you're here)")}
${styleText('cyan', 'sanity new')}   No login — mint a project now, claim it within 72 hours

Learn how it works: ${link(SANITY_NEW_URL, SANITY_NEW_URL)}`,
      {
        borderColor: 'cyan',
        borderStyle: 'round',
        padding: 1,
      },
    ),
  )
  output.log('')
}
