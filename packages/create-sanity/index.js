#!/usr/bin/env node
import {resolve} from 'node:path'
import {parseArgs} from 'node:util'

import {getLocalTelemetryDenial, getTelemetryTokenDigest} from '@sanity/cli-setup/telemetry'

import {reportBlueprintSetup} from './reportBlueprintSetup.js'

const windowsControlCExit = 0xc0_00_01_3a
const args = process.argv.slice(2)
const separator = args.indexOf('--')
const flags = separator === -1 ? args : args.slice(0, separator)
const shouldReport =
  flags.includes('--with-blueprints') &&
  !flags.includes('--help') &&
  !flags.includes('-h') &&
  !getLocalTelemetryDenial()
const startedAt = shouldReport ? performance.now() : 0
let reported = false
let outcome = 'failed'
let route = 'delegated'
let tokenDigest

if (shouldReport) process.once('SIGINT', cancel)

try {
  const options = getBlueprintOptions(args, process.env.SANITY_AUTH_TOKEN)
  if (options) {
    route = 'standalone'
    if (shouldReport) tokenDigest = getTelemetryTokenDigest(options.token)
    // eslint-disable-next-line eslint-js/no-restricted-syntax -- load Blueprint setup after routing
    const {bootstrapBlueprint} = await import('./bootstrapBlueprint.js')
    await bootstrapBlueprint(options, (message) => process.stdout.write(`${message}\n`))
    outcome = 'success'
  } else {
    // eslint-disable-next-line eslint-js/no-restricted-syntax -- load the full CLI installer on demand
    const {runInit} = await import('./runInit.js')
    const {code, signal} = await runInit(args, shouldReport ? rememberTokenDigest : undefined)
    process.exitCode = code ?? 1
    if (code === 0) outcome = 'success'
    if (code === 3 || code === 130 || code >>> 0 === windowsControlCExit || signal === 'SIGINT') {
      outcome = 'cancelled'
    }
  }
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
} finally {
  if (shouldReport) {
    reportOutcome(outcome)
    process.off('SIGINT', cancel)
  }
}

function cancel() {
  reportOutcome('cancelled')
  if (process.platform === 'win32') return process.exit(windowsControlCExit)
  process.kill(process.pid, 'SIGINT')
}

function rememberTokenDigest(digest) {
  tokenDigest = digest
}

function reportOutcome(result) {
  if (reported || !tokenDigest) return
  reported = true
  const durationMs = Math.round(performance.now() - startedAt)
  try {
    reportBlueprintSetup(route, result, durationMs, tokenDigest)
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
