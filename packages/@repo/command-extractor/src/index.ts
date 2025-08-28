#!/usr/bin/env node

import {ChildProcess, spawn} from 'node:child_process'

import {createClient} from '@sanity/client'
import 'dotenv/config'

const PACKAGE_NAME = 'newCli'
const MAX_DISCOVERY_DEPTH = 3
const CLI_COMMANDS_TYPE = 'cliCommands'

const QUERIES = {
  EXISTING_COMMANDS: `*[_type == $type && name == $name && version == $version][0]`,
} as const

interface CommandResult {
  code: number | null
  stderr: string
  stdout: string
}

interface Command {
  description: string
  name: string
  type: 'command' | 'topic'
}

interface CommandEntry {
  depth: number
  description: string
  name: string
  parent: string | null
  path: string[]
  type: 'command' | 'topic'
}

const client = createClient({
  apiVersion: '2025-01-01',
  dataset: 'production',
  projectId: 'jbvzi6yv',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

class SanityCommandDiscovery {
  private cache: Set<string>
  private commands: Map<string, CommandEntry>
  private force: boolean
  private maxDepth: number

  private version: string | null

  constructor(force: boolean = false) {
    this.commands = new Map<string, CommandEntry>()
    this.cache = new Set<string>()
    this.maxDepth = MAX_DISCOVERY_DEPTH
    this.force = force
    this.version = null
  }

  async discoverCommands(commandPath: string[] = [], depth: number = 0): Promise<void> {
    if (depth > this.maxDepth) return

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
      const result = await this.executeCommand(helpCommand)

      if (result.code !== 0) {
        console.log(`  ❌ Command failed with code ${result.code}: ${helpCommand}`)
        return
      }

      const isMainCommands = commandPath.length === 0
      const commands = isMainCommands
        ? this.parseMainCommands(result.stdout)
        : this.parseSubcommands(result.stdout)

      if (commands.length === 0) {
        console.log(`  📝 No commands found for: ${cacheKey || 'root commands'}`)
        return
      }

      console.log(`  ✅ Found ${commands.length} command(s) for: ${cacheKey || 'root commands'}`)

      // Process all commands at this level and collect topics for further discovery
      const newTopics = this.processCommands(commands, commandPath, depth)

      // Then discover subcommands only for topics in parallel
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

  async executeCommand(command: string): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const proc: ChildProcess = spawn('npx', command.split(' ').slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', (code: number | null) => {
        resolve({code, stderr, stdout})
      })

      proc.on('error', (error: Error) => {
        reject(error)
      })
    })
  }

  generateSanityDocument(): {
    _type: string
    commands: Array<{
      depth: number
      description: string
      fullPath: string
      name: string
      parent: string | null
      type: 'command' | 'topic'
    }>
    importedAt: string
    name: string
    notes: string
    totalCommands: number
    version: string
  } {
    const commands = [...this.commands.entries()].map(([path, command]) => ({
      depth: command.depth,
      description: command.description,
      fullPath: path,
      name: command.name,
      parent: command.parent,
      type: command.type,
    }))

    const version = this.version || 'unknown'

    return {
      _type: CLI_COMMANDS_TYPE,
      commands,
      importedAt: new Date().toISOString(),
      name: PACKAGE_NAME,
      notes: `Imported executable CLI commands (leaf commands only) for Sanity v${version}`,
      totalCommands: commands.length,
      version,
    }
  }

  async getSanityVersion(): Promise<string> {
    if (this.version) return this.version

    try {
      const result = await this.executeCommand('npx sanity --version')
      if (result.code === 0) {
        this.version = this.extractVersion(result.stdout)

        // Fallback: try to extract version from help command
        if (!this.version) {
          const packageResult = await this.executeCommand('npx sanity --help')
          this.version = this.extractVersion(packageResult.stdout)
        }

        console.log(`📦 Detected Sanity CLI version: ${this.version || 'unknown'}`)
        return this.version || 'unknown'
      }
    } catch (error) {
      console.error('Could not determine Sanity CLI version:', (error as Error).message)
    }

    this.version = 'unknown'
    console.log(`⚠️  Could not determine version, using: ${this.version}`)
    return this.version
  }

  async loadFromSanity(): Promise<boolean> {
    try {
      const version = await this.getSanityVersion()
      console.log(`🔎 Checking Sanity cache for version: ${this.version}`)

      // Check if a document with this name and version already exists
      const existingDoc = await client.fetch(QUERIES.EXISTING_COMMANDS, {
        name: PACKAGE_NAME,
        type: CLI_COMMANDS_TYPE,
        version,
      })

      if (!existingDoc) {
        console.log(`📭 No cached data found in Sanity for version ${this.version}`)
        return false
      }

      console.log(
        `📦 Found cached data in Sanity with ${existingDoc.commands?.length || 0} commands`,
      )

      // Load commands from existing document
      for (const command of existingDoc.commands || []) {
        const commandEntry: CommandEntry = {
          depth: command.depth,
          description: command.description,
          name: command.name,
          parent: command.parent,
          path: command.fullPath.split(' '),
          type: command.type || 'command', // Default to 'command' for backward compatibility
        }
        this.commands.set(command.fullPath, commandEntry)
      }

      console.log(`📋 Loaded ${this.commands.size} commands from Sanity cache`)

      // Apply filtering to loaded commands in case they contain parent commands
      // from an older version of the script
      this.filterLeafCommands()

      console.log(`🔧 After filtering, ${this.commands.size} leaf commands remain`)

      return true
    } catch (error) {
      console.error('Error loading from Sanity:', (error as Error).message)
      return false
    }
  }

  parseMainCommands(helpText: string): Command[] {
    const commands: Command[] = []
    const lines = helpText.split('\n')
    let currentSection: 'commands' | 'topics' | null = null

    for (const line of lines) {
      const trimmedLine = line.trim()

      // Check for section headers
      if (trimmedLine === 'TOPICS') {
        currentSection = 'topics'
        continue
      }

      if (trimmedLine === 'COMMANDS' || line.includes('Commands:')) {
        currentSection = 'commands'
        continue
      }

      if (!currentSection) continue

      // Skip empty lines
      if (trimmedLine === '') continue

      // Stop if we see the help footer
      if (this.isEndOfSection(line)) break

      // Parse command/topic lines (format: "  name  description")
      const match = line.match(/^\s+(\w+)\s+(.+)$/)
      if (match) {
        const [, name, description] = match
        commands.push({
          description: description.trim(),
          name: name.trim(),
          type: currentSection === 'topics' ? 'topic' : 'command',
        })
      }
    }

    return commands
  }

  parseSubcommands(helpText: string): Command[] {
    const subcommands: Command[] = []
    const lines = helpText.split('\n')
    let inCommandsSection = false

    for (const line of lines) {
      if (line.includes('COMMANDS')) {
        inCommandsSection = true
        continue
      }

      if (!inCommandsSection) continue

      const trimmedLine = line.trim()

      // Stop if we see the help footer
      if (this.isEndOfSection(line)) break

      // Skip empty lines
      if (trimmedLine === '') continue

      // Match lines like "  cors add     Allow a new origin..."
      // We want to extract "add" from "cors add"
      const match = line.match(/^\s+\w+\s+(\w+)\s+(.+)$/)
      if (match) {
        const [, subCommand, description] = match
        subcommands.push({
          description: description.trim(),
          name: subCommand.trim(),
          type: 'command', // Subcommands are always commands, not topics
        })
      }
    }

    return subcommands
  }

  async run(): Promise<void> {
    console.log(`🚀 Starting Sanity CLI command discovery`)
    await this.getSanityVersion()

    // Try to load existing commands from Sanity first (unless force flag is set)
    const loadedFromCache = this.force ? false : await this.loadFromSanity()

    if (loadedFromCache) {
      console.log(`⚡ Using cached data from Sanity (${this.commands.size} commands)`)
    } else {
      console.log(`🔍 No cache found or force flag set - starting fresh discovery`)
      await this.discoverCommands()
      // Filter out parent commands that have subcommands - only keep leaf commands
      console.log(`🔧 Filtering to keep only leaf commands...`)
      this.filterLeafCommands()
      console.log(`📊 Discovery complete! Found ${this.commands.size} executable commands`)
    }

    // Always upload to Sanity (either create new or update existing)
    console.log(`📤 Uploading results to Sanity...`)
    await this.uploadToSanity()
    console.log(`✅ Upload complete!`)
  }

  async uploadToSanity(): Promise<void> {
    try {
      const document = this.generateSanityDocument()

      // Check if a document with this name and version already exists
      const existingDoc = await client.fetch(QUERIES.EXISTING_COMMANDS, {
        name: PACKAGE_NAME,
        type: CLI_COMMANDS_TYPE,
        version: this.version,
      })

      if (existingDoc) {
        console.log(`🔄 Updating existing document for version ${this.version}`)
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
        console.log(`📝 Creating new document for version ${this.version}`)
        await client.create(document)
      }
    } catch (error) {
      console.error('Error uploading to Sanity:', (error as Error).message)
      throw error
    }
  }

  private extractVersion(output: string): string | null {
    // First try to match the specific CLI output format: @sanity/cli/X.Y.Z
    const cliVersionMatch = output.match(/@sanity\/cli\/(\d+\.\d+\.\d+)/)
    if (cliVersionMatch) {
      return cliVersionMatch[1]
    }

    // Fallback to any version pattern
    const versionMatch = output.match(/(\d+\.\d+\.\d+)/)
    return versionMatch ? versionMatch[1] : null
  }

  private filterLeafCommands(): void {
    // Get all command paths that are parents to other commands
    const parentPaths = new Set<string>()

    for (const [, command] of this.commands) {
      if (command.parent !== null) {
        parentPaths.add(command.parent)
      }
    }

    // Remove any commands that are parents (have subcommands)
    // Only keep leaf commands (commands with no subcommands)
    const commandsToRemove: string[] = []

    for (const [pathKey] of this.commands) {
      if (parentPaths.has(pathKey)) {
        commandsToRemove.push(pathKey)
      }
    }

    // Remove parent commands from the map
    for (const pathKey of commandsToRemove) {
      this.commands.delete(pathKey)
    }
  }

  private isEndOfSection(line: string): boolean {
    return line.startsWith("See '") || line.includes('--help')
  }

  private processCommands(commands: Command[], commandPath: string[], depth: number): string[][] {
    const newTopics: string[][] = []

    // Store all commands initially - we'll filter out parent commands later
    // to keep only executable leaf commands
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

        // Only collect topics for further discovery (topics have subcommands)
        if (cmd.type === 'topic') {
          newTopics.push(fullPath)
        }
      }
    }

    return newTopics
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
let force = false
let help = false

for (const arg of args) {
  if (arg === '--force' || arg === '-f') {
    force = true
  } else if (arg === '--help' || arg === '-h') {
    help = true
  }
}

if (help) {
  console.log(`
Usage: discover-sanity-commands.mts [options]

Discovers and caches Sanity CLI commands.

Options:
  -f, --force    Skip cache and force fresh discovery
  -h, --help     Show this help message
`)
  process.exit(0)
}

// Run the script
const discovery = new SanityCommandDiscovery(force)
await discovery.run()

console.log(`🎉 Command discovery completed successfully!`)
