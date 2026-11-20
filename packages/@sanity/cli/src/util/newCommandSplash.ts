import {styleText} from 'node:util'

import {getTerminalLogo} from './terminalLogo.js'

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

export async function renderNewCommandSplash(log: LogFn): Promise<void> {
  log('')
  const logo = await getTerminalLogo()
  if (logo) {
    log(logo)
  } else {
    for (const line of ART) log(styleText('cyan', line))
  }
  log('')
}
