#!/usr/bin/env node
import {isInteractive} from '@sanity/cli-core'
import {parse} from '@oclif/core/parser'

import {initAction} from '@sanity/cli/actions/init/initAction'
import {InitError} from '@sanity/cli/actions/init/initError'
import {flagsToInitOptions} from '@sanity/cli/actions/init/types'
import {InitCommand} from '@sanity/cli/commands/init'

import {createNoopTelemetryStore} from './noopTelemetry.js'

async function main(): Promise<void> {
  const {args, flags} = await parse(process.argv.slice(2), {
    args: InitCommand.args,
    flags: InitCommand.flags,
    strict: true,
  })

  // Compute MCP mode (same logic as InitCommand.run)
  let mcpMode: 'auto' | 'prompt' | 'skip' = 'prompt'
  if (!flags.mcp || !isInteractive()) {
    mcpMode = 'skip'
  } else if (flags.yes) {
    mcpMode = 'auto'
  }

  const isUnattended = flags.yes || !isInteractive()

  const options = flagsToInitOptions({...flags, 'from-create': true}, isUnattended, args, mcpMode)

  await initAction(options, {
    output: {
      log: console.log,
      warn: console.warn,
      error: (msg: string) => {
        console.error(msg)
        process.exit(1)
      },
    },
    telemetry: createNoopTelemetryStore(),
    workDir: process.cwd(),
  })
}

main().catch((error) => {
  if (error instanceof InitError) {
    if (error.message) {
      console.error(error.message)
    }
    process.exit(error.exitCode)
  }
  console.error(error)
  process.exit(1)
})
