import {client} from './client.js'
import {CLI_COMMANDS_TYPE, PACKAGE_NAME, QUERIES} from './constants.js'
import {type CommandEntry, type SanityDocument} from './types.js'

function generateSanityDocument(
  commands: Map<string, CommandEntry>,
  version: string,
): SanityDocument {
  const commandsArray = [...commands.entries()].map(([path, command]) => ({
    depth: command.depth,
    description: command.description,
    fullPath: path,
    name: command.name,
    parent: command.parent,
    type: command.type,
  }))

  return {
    _type: CLI_COMMANDS_TYPE,
    commands: commandsArray,
    importedAt: new Date().toISOString(),
    name: PACKAGE_NAME,
    notes: `Imported executable CLI commands (leaf commands only) for Sanity v${version}`,
    totalCommands: commandsArray.length,
    version,
  }
}

export async function loadCommands(version: string): Promise<Map<string, CommandEntry> | null> {
  try {
    console.log(`🔎 Checking Sanity cache for version: ${version}`)

    const existingDoc = await client.fetch(QUERIES.EXISTING_COMMANDS, {
      name: PACKAGE_NAME,
      type: CLI_COMMANDS_TYPE,
      version,
    })

    if (!existingDoc) {
      console.log(`📭 No cached data found in Sanity for version ${version}`)
      return null
    }

    console.log(`📦 Found cached data in Sanity with ${existingDoc.commands?.length || 0} commands`)

    const commands = new Map<string, CommandEntry>()

    for (const command of existingDoc.commands || []) {
      const commandEntry: CommandEntry = {
        depth: command.depth,
        description: command.description,
        name: command.name,
        parent: command.parent,
        path: command.fullPath.split(' '),
        type: command.type || 'command',
      }
      commands.set(command.fullPath, commandEntry)
    }

    console.log(`📋 Loaded ${commands.size} commands from Sanity cache`)
    return commands
  } catch (error) {
    console.error('Error loading from Sanity:', (error as Error).message)
    return null
  }
}

export async function saveCommands(
  commands: Map<string, CommandEntry>,
  version: string,
): Promise<void> {
  try {
    const document = generateSanityDocument(commands, version)

    const existingDoc = await client.fetch(QUERIES.EXISTING_COMMANDS, {
      name: PACKAGE_NAME,
      type: CLI_COMMANDS_TYPE,
      version,
    })

    if (existingDoc) {
      console.log(`🔄 Updating existing document for version ${version}`)
      await client
        .patch(existingDoc._id)
        .set({
          commands: document.commands,
          importedAt: document.importedAt,
          notes: document.notes,
          totalCommands: document.totalCommands,
        })
        .commit()
    } else {
      console.log(`📝 Creating new document for version ${version}`)
      await client.create(document)
    }
  } catch (error) {
    console.error('Error uploading to Sanity:', (error as Error).message)
    throw error
  }
}
