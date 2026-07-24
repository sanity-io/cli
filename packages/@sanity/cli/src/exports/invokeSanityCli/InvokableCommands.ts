import {type Config} from '@oclif/core'

import {Add as CorsAdd} from '../../commands/cors/add.js'
import {Delete as CorsDelete} from '../../commands/cors/delete.js'
import {List as CorsList} from '../../commands/cors/list.js'
import {List as ProjectsList} from '../../commands/projects/list.js'

export interface InvokableCommand {
  run(argv: string[], config: Config): Promise<unknown>
}

export const invokableCommands: ReadonlyMap<string, InvokableCommand> = new Map<
  string,
  InvokableCommand
>([
  ['cors add', CorsAdd],
  ['cors delete', CorsDelete],
  ['cors list', CorsList],
  ['projects list', ProjectsList],
])
