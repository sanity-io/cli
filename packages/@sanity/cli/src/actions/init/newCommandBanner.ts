import {styleText} from 'node:util'

import {boxen} from '@sanity/cli-core/ux'

import {CLAIM_WINDOW_HOURS, SANITY_NEW_URL} from '../../util/mintProjectConstants.js'
import {hyperlink as link} from '../../util/terminalLink.js'
import {type InitContext} from './types.js'

export function renderNewCommandBanner(output: InitContext['output']): void {
  output.log('')
  output.log(
    boxen(
      `${styleText('bold', 'Two ways to start')}

${styleText('cyan', 'sanity init')}  Log in or sign up and make a new project ${styleText('dim', "(you're here)")}
${styleText('cyan', 'sanity new')}   Create a project without an account.
             Sign up and claim it within ${CLAIM_WINDOW_HOURS} hours to keep it.`,
      {
        borderColor: 'cyan',
        borderStyle: 'round',
        padding: 1,
      },
    ),
  )
  output.log('')
  output.log(
    styleText(
      'dim',
      'If an agent is running this, use `sanity new --json` to create a project programmatically.',
    ),
  )
  output.log(styleText('dim', `Fetch ${link(SANITY_NEW_URL, SANITY_NEW_URL)} to learn more.`))
  output.log('')
}
