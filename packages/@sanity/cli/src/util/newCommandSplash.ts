import {styleText} from 'node:util'

import {hyperlink} from './terminalLink.js'

/** Sink for splash lines — matches the `Output['log']` shape commands already carry. */
type LogFn = (message?: string) => void

/** The Sanity squiggle, as terminal-safe ASCII art. */
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

// Full URLs, no tree branching — the visible text doubles as the link target, so terminals'
// native URL detection works alongside the OSC 8 hyperlink. Built per render, not at module
// load: `hyperlink` decides OSC 8 support at call time, and freezing that decision at import
// would bake in whatever stdout happened to be during module init.
const LINK_URLS = ['https://sanity.new', 'https://sanity.io/learn']
const renderLinks = () => LINK_URLS.map((url) => hyperlink(styleText('cyan', url), url))

/** Art row the link tree starts on when rendered to the right of the squiggle. */
const LINKS_START_ROW = 5

/** Column the link tree starts in — a little breathing room past the widest art row. */
const LINKS_COLUMN = Math.max(...ART.map((line) => line.length)) + 5

/** Visible width of the widest link — the side-by-side layout must fit column + this. */
const LINKS_WIDTH = Math.max(...LINK_URLS.map((url) => url.length))

/**
 * Neon.new-style splash: the Sanity squiggle with a small tree of relevant links beside it,
 * padded with blank lines on both ends. On terminals too narrow for the side-by-side layout the
 * links render below the art instead; without a TTY (agents, pipes) width is unknown and the
 * side-by-side layout is used, since the reader is not wrapping lines visually.
 */
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
