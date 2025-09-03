import {type Command, type ParseSection} from './types.js'

interface ParseState {
  currentCommand: {description: string; name: string} | null
  currentSection: ParseSection
  inCommandsSection: boolean
}

function detectSectionHeader(line: string): ParseSection {
  const upperLine = line.toUpperCase()
  if (upperLine === 'TOPICS') return 'topics'
  if (upperLine === 'COMMANDS') return 'commands'
  return null
}

function isEndOfSection(line: string): boolean {
  return line.startsWith("See '") || line.includes('--help')
}

function parseCommandLine(line: string, sectionType: ParseSection): Command | null {
  const match = line.match(/^\s+(\w+)\s+(.+)$/)
  if (!match) return null

  const [, name, description] = match
  return {
    description: description.trim(),
    name: name.trim(),
    type: sectionType === 'topics' ? 'topic' : 'command',
  }
}

function parseSubcommandLine(line: string): {description: string; name: string} | null {
  const match = line.match(/^\s+([\w\s]+?)\s{2,}(.+)$/)
  if (!match) return null

  const [, fullCommand, description] = match
  return {
    description: description.trim(),
    name: fullCommand.trim(),
  }
}

function finalizeCurrentCommand(commands: Command[], state: ParseState): void {
  if (!state.currentCommand || !state.currentSection) return

  const commandWords = state.currentCommand.name.split(/\s+/)
  const subCommand = commandWords.at(-1)

  if (subCommand) {
    commands.push({
      description: state.currentCommand.description.trim(),
      name: subCommand.trim(),
      type: state.currentSection === 'topics' ? 'topic' : 'command',
    })
  }

  state.currentCommand = null
}

function processSubcommandLine(line: string, commands: Command[], state: ParseState): void {
  const sectionType = detectSectionHeader(line)
  if (sectionType) {
    finalizeCurrentCommand(commands, state)
    state.inCommandsSection = true
    state.currentSection = sectionType
    return
  }

  if (!state.inCommandsSection) return

  const trimmedLine = line.trim()
  if (trimmedLine === '') {
    finalizeCurrentCommand(commands, state)
    return
  }

  const command = parseSubcommandLine(line)
  if (command) {
    finalizeCurrentCommand(commands, state)
    state.currentCommand = command
  } else if (state.currentCommand && trimmedLine) {
    state.currentCommand.description += ' ' + trimmedLine
  }
}

export function parseMainCommands(helpText: string): Command[] {
  const commands: Command[] = []
  const lines = helpText.split('\n')
  let currentSection: ParseSection = null

  for (const line of lines) {
    const trimmedLine = line.trim()

    if (isEndOfSection(line)) break

    const sectionType = detectSectionHeader(trimmedLine)
    if (sectionType) {
      currentSection = sectionType
      continue
    }

    if (!currentSection || trimmedLine === '') continue

    const command = parseCommandLine(line, currentSection)
    if (command) {
      commands.push(command)
    }
  }

  return commands
}

export function parseSubcommands(helpText: string): Command[] {
  const commands: Command[] = []
  const lines = helpText.split('\n')
  const state: ParseState = {
    currentCommand: null,
    currentSection: null,
    inCommandsSection: false,
  }

  for (const line of lines) {
    if (isEndOfSection(line)) break

    processSubcommandLine(line, commands, state)
  }

  finalizeCurrentCommand(commands, state)
  return commands
}
