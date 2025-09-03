import {executeCommand} from './CommandExecutor.js'
import {parseMainCommands, parseSubcommands} from './CommandParser.js'
import {MAX_DISCOVERY_DEPTH} from './constants.js'
import {loadCommands, saveCommands} from './SanityStorage.js'
import {type Command, type CommandEntry} from './types.js'
import {detectVersion} from './utils/version.js'

export class CommandDiscovery {
  private cache: Set<string>
  private commands: Map<string, CommandEntry>
  private force: boolean
  private version: string | null

  constructor(force: boolean = false) {
    this.commands = new Map<string, CommandEntry>()
    this.cache = new Set<string>()
    this.force = force
    this.version = null
  }

  async run(): Promise<void> {
    console.log('🚀 Starting Sanity CLI command discovery')
    this.version = await detectVersion(executeCommand)

    const loadedFromCache = this.force ? false : await this.loadFromCache()

    if (loadedFromCache) {
      console.log(`⚡ Using cached data from Sanity (${this.commands.size} commands)`)
    } else {
      console.log('🔍 No cache found or force flag set - starting fresh discovery')
      await this.discoverCommands()
      this.filterLeafCommands()
      console.log(`📊 Discovery complete! Found ${this.commands.size} executable commands`)
    }

    console.log('📤 Uploading results to Sanity...')
    await saveCommands(this.commands, this.version || 'unknown')
    console.log('✅ Upload complete!')
  }

  private async discoverCommands(commandPath: string[] = [], depth: number = 0): Promise<void> {
    if (depth > MAX_DISCOVERY_DEPTH) return

    const cacheKey = commandPath.join(' ')
    if (!this.force && this.cache.has(cacheKey)) {
      console.log(`⚡ Using cached discovery for: ${cacheKey || 'root commands'}`)
      return
    }

    this.cache.add(cacheKey)
    console.log(`🔍 Discovering commands for: ${cacheKey || 'root commands'} (depth: ${depth})`)

    const helpCommand =
      commandPath.length === 0 ? 'npx sanity help' : `npx sanity help ${commandPath.join(' ')}`

    try {
      console.log(`  📡 Executing: ${helpCommand}`)
      const result = await executeCommand(helpCommand)

      if (result.code !== 0) {
        console.log(`  ❌ Command failed with code ${result.code}: ${helpCommand}`)
        return
      }

      const isMainCommands = commandPath.length === 0
      const commands = isMainCommands
        ? parseMainCommands(result.stdout)
        : parseSubcommands(result.stdout)

      if (commands.length === 0) {
        console.log(`  📝 No commands found for: ${cacheKey || 'root commands'}`)
        return
      }

      console.log(`  ✅ Found ${commands.length} command(s) for: ${cacheKey || 'root commands'}`)

      const newTopics = this.processCommands(commands, commandPath, depth)

      // Check for hidden topics (commands that are actually topics with subcommands)
      const hiddenTopics = await this.findHiddenTopics(commands, commandPath)
      newTopics.push(...hiddenTopics)

      if (newTopics.length > 0) {
        console.log(
          `  🔄 Discovering ${newTopics.length} topic(s): ${newTopics.map((t) => t.join(' ')).join(', ')}`,
        )
        await Promise.all(newTopics.map((fullPath) => this.discoverCommands(fullPath, depth + 1)))
      }
    } catch (error) {
      console.error(`Error discovering ${helpCommand}:`, (error as Error).message)
    }
  }

  private filterLeafCommands(): void {
    const parentPaths = new Set<string>()

    for (const [, command] of this.commands) {
      if (command.parent !== null) {
        parentPaths.add(command.parent)
      }
    }

    const commandsToRemove: string[] = []
    for (const [pathKey] of this.commands) {
      if (parentPaths.has(pathKey)) {
        commandsToRemove.push(pathKey)
      }
    }

    for (const pathKey of commandsToRemove) {
      this.commands.delete(pathKey)
    }
  }

  private async findHiddenTopics(commands: Command[], commandPath: string[]): Promise<string[][]> {
    const hiddenTopics: string[][] = []

    for (const cmd of commands.filter((c) => c.type === 'command')) {
      const fullPath = [...commandPath, cmd.name]
      const helpCommand = `npx sanity help ${fullPath.join(' ')}`

      try {
        console.log(`  🔍 Checking if "${fullPath.join(' ')}" has subcommands...`)
        const result = await executeCommand(helpCommand)

        if (result.code === 0 && result.stdout.includes('Commands')) {
          console.log(`  ✨ Found hidden topic: ${fullPath.join(' ')}`)
          hiddenTopics.push(fullPath)

          const pathKey = fullPath.join(' ')
          const existingCommand = this.commands.get(pathKey)
          if (existingCommand) {
            existingCommand.type = 'topic'
          }
        }
      } catch {
        // Ignore errors when checking for subcommands
      }
    }

    return hiddenTopics
  }

  private async loadFromCache(): Promise<boolean> {
    if (!this.version) return false

    const commands = await loadCommands(this.version)
    if (!commands) return false

    this.commands = commands
    this.filterLeafCommands()
    console.log(`🔧 After filtering, ${this.commands.size} leaf commands remain`)
    return true
  }

  private processCommands(commands: Command[], commandPath: string[], depth: number): string[][] {
    const newTopics: string[][] = []

    for (const cmd of commands) {
      const fullPath = [...commandPath, cmd.name]
      const pathKey = fullPath.join(' ')

      if (!this.commands.has(pathKey)) {
        this.commands.set(pathKey, {
          depth: depth + 1,
          description: cmd.description,
          name: cmd.name,
          parent: commandPath.join(' ') || null,
          path: fullPath,
          type: cmd.type,
        })

        if (cmd.type === 'topic') {
          newTopics.push(fullPath)
        }
      }
    }

    return newTopics
  }
}
