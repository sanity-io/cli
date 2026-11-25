#!/usr/bin/env node
import {resolve} from 'node:path'
import {parseArgs} from 'node:util'

import {reportBlueprintSetup} from './reportBlueprintSetup.js'

const args = process.argv.slice(2)
const separator = args.indexOf('--')
const flags = separator === -1 ? args : args.slice(0, separator)
const isBlueprintAttempt =
  flags.includes('--with-blueprints') && !flags.includes('--help') && !flags.includes('-h')
const startedAt = isBlueprintAttempt ? performance.now() : 0
let reported = false
let outcome = 'failed'
let route = 'delegated'

if (isBlueprintAttempt) process.once('SIGINT', cancel)

try {
  const options = getBlueprintOptions(args, process.env.SANITY_AUTH_TOKEN)
  if (options) {
    route = 'standalone'
    // eslint-disable-next-line eslint-js/no-restricted-syntax -- load Blueprint setup after routing
    const {bootstrapBlueprint} = await import('./bootstrapBlueprint.js')
    await bootstrapBlueprint(options, (message) => process.stdout.write(`${message}\n`))
    outcome = 'success'
  } else {
    // eslint-disable-next-line eslint-js/no-restricted-syntax -- load the full CLI installer on demand
    const {runInit} = await import('./runInit.js')
    const {code, signal} = await runInit(args)
    process.exitCode = code ?? 1
    if (code === 0) outcome = 'success'
    if (code === 3 || code === 130 || signal === 'SIGINT') outcome = 'cancelled'
  }
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
} finally {
  if (isBlueprintAttempt) {
    reportOutcome(outcome)
    process.off('SIGINT', cancel)
  }
}

function cancel() {
  reportOutcome('cancelled')
  process.kill(process.pid, 'SIGINT')
}

function reportOutcome(result) {
  if (reported) return
  reported = true
  const durationMs = Math.round(performance.now() - startedAt)
  try {
    reportBlueprintSetup(route, result, durationMs)
  } catch {
    // Telemetry is best effort.
  }
}

function getBlueprintOptions(argv, authToken) {
  const token = authToken?.trim()
  if (!token || !argv.includes('--with-blueprints')) return

  let values
  try {
    values = parseArgs({
      args: argv,
      options: {
        dataset: {type: 'string'},
        organization: {type: 'string'},
        'output-path': {type: 'string'},
        project: {short: 'p', type: 'string'},
        'project-name': {type: 'string'},
        visibility: {type: 'string'},
        'with-blueprints': {type: 'boolean'},
        yes: {short: 'y', type: 'boolean'},
      },
    }).values
  } catch {
    return
  }

  const {dataset, organization, project, visibility} = values
  const projectName = values['project-name']?.trim()
  if (!values.yes || !values['with-blueprints'] || !dataset) return
  if (visibility !== undefined && visibility !== 'public') return
  const existingProject =
    project && values['project-name'] === undefined && organization === undefined
  const newProject = project === undefined && projectName && organization
  if (!existingProject && !newProject) return

  return {
    dataset,
    organization,
    outputPath: resolve(values['output-path'] ?? '.'),
    project,
    projectName,
    token,
    visibility,
  }
}
