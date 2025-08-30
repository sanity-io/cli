export interface CommandResult {
  code: number | null
  stderr: string
  stdout: string
}

export interface Command {
  description: string
  name: string
  type: 'command' | 'topic'
}

export interface CommandEntry {
  depth: number
  description: string
  name: string
  parent: string | null
  path: string[]
  type: 'command' | 'topic'
}

interface SanityCommand {
  depth: number
  description: string
  fullPath: string
  name: string
  parent: string | null
  type: 'command' | 'topic'
}

export interface SanityDocument {
  _type: string
  commands: SanityCommand[]
  importedAt: string
  name: string
  notes: string
  totalCommands: number
  version: string
}

export type ParseSection = 'commands' | 'topics' | null
