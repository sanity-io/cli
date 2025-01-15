import {type CliCommandDefinition} from '../../types.js'
import showHelp from './showHelp.js'

const help = `
With no options and no COMMAND given, the synopsis of the sanity command and a
list of the most commonly used commands are printed on the standard output.

If a command is given, the help page for that command is printed to standard
output. This will usually be more in-depth than the brief description shown in
the command list.
`

const command: CliCommandDefinition = {
  name: 'help',
  signature: '[COMMAND]',
  description: 'Displays help information about Sanity CLI commands',
  action: showHelp,
  helpText: help,
}

export default command
