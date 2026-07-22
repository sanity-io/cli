import {styleText} from 'node:util'

import {boxen} from '@sanity/cli-core/ux'

import {hyperlink as link} from '../../util/terminalLink.js'
import {type InitContext} from './types.js'

const SANITY_NEW_URL = 'https://sanity.new'

/**
 * The fork-in-the-road signpost shown before init's interactive login takes over the terminal:
 * frames `init` and `new` as two equally valid front doors. A one-time boxed moment is
 * deliberate here — unlike the recurring claim reminders, it renders once per init run, so the
 * box draws the eye without training anyone to skim past it. (Three prototype treatments
 * existed behind a `SANITY_NEW_BANNER` env switch during evaluation; UAT standardized on this
 * one and dropped the switch.)
 */
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
