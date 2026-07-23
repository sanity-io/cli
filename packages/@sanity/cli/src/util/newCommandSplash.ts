import {styleText} from 'node:util'

import {hyperlink} from './terminalLink.js'

type LogFn = (message?: string) => void

const ART = [
  '          -          #:      @@@@',
  '         @@@      @@@@@    -@@@=   @@@',
  '       @@@@   %@@@@@@.    @@@@ %@@@@@@',
  '      @@@% @@@@@@@#     %@@@@@@@@@-',
  '    @@@@@@@@@@@@@      @@@@@@@@.',
  '   @@@@@@@= @@@#     @@@@@@@        @@@@@',
  '   @@@@   @@@@    @@@@@@         @@@@@@@',
  '         @@@@ @@@@@@@@        @@@@@@@@',
  '       +@@@@@@@@@@@@@      @@@@@@@@@@',
  '      @@@@@@@@ @@@@     @@@@@@ @@@@',
  '     @@@@@%  *@@@%  .@@@@@%  .@@@@ .@@@@',
  '      .-    @@@@ .@@@@@%    #@@@.@@@@@@@@',
  '          *@@@@@@@@@%      @@@@@@@@#@@@@',
  '         @@@@@@@@        #@@@@@@#  @@@@',
  '       @@@@@@@           @@@@#    @@@@',
  '      #@@@@               *      @@@+',
  '                                  =',
]

// Built per render, not at module load: `hyperlink` decides OSC 8 support from stdout at call
// time, so freezing the links at import would bake in whatever stdout was during module init.
const LINK_URLS = ['https://sanity.new', 'https://sanity.io/learn']
const renderLinks = () => LINK_URLS.map((url) => hyperlink(styleText('cyan', url), url))

/** Art row the link tree starts on when rendered to the right of the squiggle. */
const LINKS_START_ROW = 5

/** Column the link tree starts in, with buffer for the widest art row. */
const LINKS_COLUMN = Math.max(...ART.map((line) => line.length)) + 5

/** Visible width of the widest link. */
const LINKS_WIDTH = Math.max(...LINK_URLS.map((url) => url.length))

export function renderNewCommandSplash(log: LogFn): void {
  const columns = process.stdout.columns
  const sideBySide = !columns || columns >= LINKS_COLUMN + LINKS_WIDTH
  const links = renderLinks()

  log('')
  for (const [row, line] of ART.entries()) {
    const link = sideBySide ? links[row - LINKS_START_ROW] : undefined
    log(link ? `${styleText('cyan', line.padEnd(LINKS_COLUMN))}${link}` : styleText('cyan', line))
  }
  if (!sideBySide) {
    log('')
    for (const link of links) log(`   ${link}`)
  }
  log('')
}
