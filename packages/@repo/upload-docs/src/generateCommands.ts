import {resolve} from 'node:path'

import {type Command, Config} from '@oclif/core'
import uniqBy from 'lodash-es/uniqBy.js'

export interface CommandInfo {
  aliases: string[]
  args: Record<string, Command.Arg.Cached>
  description: string
  examples: Command.Example[]
  flags: Record<string, Command.Flag.Cached>
  fullCommand: string
  id: string
}

const commandsMap = new Map<string, CommandInfo>()

/**
 * Gets all the commands from the CLI
 */
export async function generateCommands(): Promise<CommandInfo[]> {
  const config = await Config.load({
    // Path to the CLI root
    ignoreManifest: true,
    root: resolve(import.meta.dirname, '../../../@sanity/cli'),
  })

  const commands = uniqBy(
    config.commands
      .filter((c) => !c.hidden && c.pluginType === 'core')
      .toSorted((a, b) => a.id.localeCompare(b.id)),
    (c) => c.id,
  )

  for (const command of commands) {
    commandsMap.set(command.id, {
      aliases: command.aliases,
      args: command.args,
      description: command.description ?? '',
      examples: generateExamples({command, config, examples: command.examples ?? []}),
      flags: command.flags,
      fullCommand: getCommandId(command, config),
      id: command.id,
    })
  }

  return [...commandsMap.values()]
}

/**
 * Replaces bin and command id with the configured bin and command id
 */
function generateExamples({
  command,
  config,
  examples,
}: {
  command: Command.Loadable
  config: Config
  examples: Command.Example[]
}): Command.Example[] {
  const bin = config.bin
  const id = getCommandId(command, config)

  const newExamples: Command.Example[] = []
  for (let example of examples) {
    if (typeof example === 'string') {
      example = getCommandHelp({bin, id, str: example})
      newExamples.push(example)
    } else {
      example.command = getCommandHelp({bin, id, str: example.command})
      newExamples.push(example)
    }
  }

  return newExamples
}

function getCommandHelp({bin, id, str}: {bin: string; id: string; str: string}): string {
  return str.replace('<%= config.bin %>', bin).replace('<%= command.id %>', id).trim()
}

function getCommandId(command: Command.Loadable, config: Config): string {
  return command.id.replaceAll(':', config.topicSeparator)
}
