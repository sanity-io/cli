#!/usr/bin/env node

import 'dotenv/config'

import {CommandDiscovery} from './CommandDiscovery.js'

function parseArguments(): {force: boolean; help: boolean} {
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

  return {force, help}
}

function showHelp(): void {
  console.log(`
Usage: discover-sanity-commands.mts [options]

Discovers and caches Sanity CLI commands.

Options:
  -f, --force    Skip cache and force fresh discovery
  -h, --help     Show this help message
`)
}

async function main(): Promise<void> {
  const {force, help} = parseArguments()

  if (help) {
    showHelp()
    process.exit(0)
  }

  const discovery = new CommandDiscovery(force)
  await discovery.run()
  console.log('🎉 Command discovery completed successfully!')
}

try {
  await main()
} catch (error) {
  console.error('❌ Command discovery failed:', error)
  process.exit(1)
}
